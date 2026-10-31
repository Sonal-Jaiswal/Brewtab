import { useNow } from '@/shared/hooks';
import { WIDGETS, widgetSetting, type WidgetProps } from './registry';

// Short, widely attributed quotes bundled locally (no network).
const QUOTES: [string, string][] = [
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['What we think, we become.', 'Buddha'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['Quality is not an act, it is a habit.', 'Aristotle'],
  ['The best way out is always through.', 'Robert Frost'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['Nothing will work unless you do.', 'Maya Angelou'],
  ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
  ['Make each day your masterpiece.', 'John Wooden'],
  ['Focus is a matter of deciding what things you’re not going to do.', 'John Carmack'],
  ['The present moment is filled with joy and happiness. If you are attentive, you will see it.', 'Thich Nhat Hanh'],
  ['How we spend our days is, of course, how we spend our lives.', 'Annie Dillard'],
  ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['Slow and steady wins the race.', 'Aesop'],
  ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
  ['Whatever you are, be a good one.', 'Abraham Lincoln'],
  ['Act as if what you do makes a difference. It does.', 'William James'],
  ['Be so good they can’t ignore you.', 'Steve Martin'],
  ['Inspiration exists, but it has to find you working.', 'Pablo Picasso'],
  ['A year from now you may wish you had started today.', 'Karen Lamb'],
  ['Small deeds done are better than great deeds planned.', 'Peter Marshall'],
  ['If you spend too much time thinking about a thing, you’ll never get it done.', 'Bruce Lee'],
  ['Rest when you’re weary. Refresh and renew yourself.', 'Ralph Marston'],
  ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott'],
];

export function quoteForDay(date: Date): [string, string] {
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return QUOTES[(day + date.getFullYear()) % QUOTES.length];
}

export default function QuoteWidget({ instance }: WidgetProps) {
  const now = useNow(60 * 60_000);
  const [text, author] = quoteForDay(now);
  const showAuthor = widgetSetting<boolean>(instance, WIDGETS.quote, 'showAuthor');
  return (
    <figure className="flex h-full flex-col justify-center px-2">
      <blockquote className="font-display text-[clamp(17px,1.6vw,22px)] leading-snug font-light text-balance italic">“{text}”</blockquote>
      {showAuthor && <figcaption className="mt-3 text-[12.5px] text-muted">— {author}</figcaption>}
    </figure>
  );
}
