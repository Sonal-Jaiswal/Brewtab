// Translates ScrollStop configuration into declarativeNetRequest dynamic rules.
// Pure: the service worker computes the desired rule set and replaces the old one.
import type { BlockRule, ScrollStopSettings } from '@/shared/types';
import { normalizeDomain } from '@/shared/utils/url';

type Rule = chrome.declarativeNetRequest.Rule;

export const PRIORITY_BLOCK = 1;
export const PRIORITY_ALLOW = 10;

export type BlockReason = 'focus' | 'schedule' | 'always' | 'limit';

export interface RuleContext {
  moduleEnabled: boolean;
  focusActive: boolean;
  scheduleActive: boolean;
  limitDomains: string[];
  /** With host access we can redirect to the custom blocked page; otherwise we block. */
  canRedirect: boolean;
  blockedPageUrl: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convert a user URL pattern into an RE2-compatible regex.
 * "reddit.com/r/*" → matches any scheme, any subdomain of reddit.com, path /r/…
 * "*" inside the pattern is a wildcard.
 */
export function patternToRegex(pattern: string): string | null {
  let s = pattern.trim().toLowerCase().replace(/^[a-z*]+:\/\//, '');
  if (!s) return null;
  const slash = s.search(/[/?#]/);
  const hostPart = slash === -1 ? s : s.slice(0, slash);
  let pathPart = slash === -1 ? '' : s.slice(slash);
  const host = hostPart.replace(/^\*\./, '').replace(/^www\./, '');
  if (!normalizeDomain(host.replace(/\*/g, 'x'))) return null;
  const hostRe = host.split('*').map(escapeRe).join('[^/?#]*');
  if (pathPart.endsWith('*')) pathPart = pathPart.replace(/\*+$/, '');
  const pathRe = pathPart.split('*').map(escapeRe).join('.*');
  const tail = pathPart ? '' : '([/?#].*)?$';
  s = `^https?://([^/?#]+\\.)?${hostRe}(:\\d+)?${pathRe}${tail}`;
  return s;
}

export function validateRuleInput(kind: BlockRule['kind'], value: string): string | null {
  if (kind === 'domain') return normalizeDomain(value);
  return patternToRegex(value) ? value.trim().toLowerCase().replace(/^[a-z*]+:\/\//, '') : null;
}

function condition(rule: BlockRule): chrome.declarativeNetRequest.RuleCondition | null {
  const resourceTypes = ['main_frame' as chrome.declarativeNetRequest.ResourceType];
  if (rule.kind === 'domain') {
    const d = normalizeDomain(rule.value);
    return d ? { requestDomains: [d], resourceTypes } : null;
  }
  const re = patternToRegex(rule.value);
  return re ? { regexFilter: re, resourceTypes, isUrlFilterCaseSensitive: false } : null;
}

function blockAction(ctx: RuleContext, reason: BlockReason, cond: chrome.declarativeNetRequest.RuleCondition) {
  if (!ctx.canRedirect) {
    return { action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType }, condition: cond };
  }
  // Redirect through a regex so the original URL is passed to the blocked page.
  const regexFilter = cond.regexFilter ?? '^https?://.*';
  return {
    action: {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { regexSubstitution: `${ctx.blockedPageUrl}?reason=${reason}#\\0` },
    },
    condition: { ...cond, regexFilter, isUrlFilterCaseSensitive: false },
  };
}

export function currentBlockReason(settings: ScrollStopSettings, ctx: RuleContext): BlockReason | null {
  if (!ctx.moduleEnabled) return null;
  if (ctx.focusActive && settings.focus.blockDuringFocus) return 'focus';
  if (ctx.scheduleActive) return 'schedule';
  if (settings.alwaysOn) return 'always';
  return null;
}

export function buildRules(settings: ScrollStopSettings, ctx: RuleContext): Rule[] {
  if (!ctx.moduleEnabled) return [];
  const rules: Rule[] = [];
  let id = 1;
  const reason = currentBlockReason(settings, ctx);

  if (reason) {
    for (const r of settings.blocklist) {
      if (!r.enabled) continue;
      const cond = condition(r);
      if (cond) rules.push({ id: id++, priority: PRIORITY_BLOCK, ...blockAction(ctx, reason, cond) });
    }
  }

  for (const d of ctx.limitDomains) {
    const domain = normalizeDomain(d);
    if (!domain) continue;
    rules.push({
      id: id++,
      priority: PRIORITY_BLOCK,
      ...blockAction(ctx, 'limit', { requestDomains: [domain], resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType] }),
    });
  }

  if (rules.length > 0) {
    for (const r of settings.allowlist) {
      if (!r.enabled) continue;
      const cond = condition(r);
      if (cond) rules.push({ id: id++, priority: PRIORITY_ALLOW, action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType }, condition: cond });
    }
  }
  return rules;
}

/** Check a URL against rules the way DNR would (used by the popup and tests). */
export function isUrlBlockedBy(rules: Rule[], url: string): Rule | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const matches = rules.filter((r) => {
    const c = r.condition;
    if (c.requestDomains && !c.requestDomains.some((d) => host === d || host.endsWith(`.${d}`))) return false;
    if (c.regexFilter && !new RegExp(c.regexFilter, c.isUrlFilterCaseSensitive === false ? 'i' : '').test(url)) return false;
    return true;
  });
  if (matches.length === 0) return null;
  const top = matches.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1))[0];
  return top.action.type === 'allow' ? null : top;
}
