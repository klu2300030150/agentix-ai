type Message = { role: string; content: string };

export function getContinuationGoal(messages: Message[], fallback: string): string {
  const userMessages = messages.filter(message => message.role === 'user' && message.content.trim());
  const isContinuation = (content: string) => content.length <= 200 &&
    /^(?:continue|conitinue|conitnue|resume|retry|keep going|do it|now (?:do more|continue|keep|finish|complete|improve|upgrade))\b/i.test(content.trim());
  const originalGoal = [...userMessages].reverse().find(message => message.content.trim().length > 200 && !isContinuation(message.content))
    || [...userMessages].reverse().find(message => !isContinuation(message.content));

  return originalGoal?.content.trim() || fallback;
}
