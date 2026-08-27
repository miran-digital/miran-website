export type TimedHeaderMessage = {
  visible: boolean;
  startsAt: string;
  endsAt: string;
};

export function filterActiveHeaderMessages<T extends TimedHeaderMessage>(
  messages: readonly T[],
  now = Date.now(),
) {
  return messages.filter((message) => {
    if (!message.visible) return false;
    const startsAt = message.startsAt ? Date.parse(message.startsAt) : null;
    const endsAt = message.endsAt ? Date.parse(message.endsAt) : null;
    if (
      (startsAt !== null && Number.isNaN(startsAt)) ||
      (endsAt !== null && Number.isNaN(endsAt))
    ) return false;
    return (
      (startsAt === null || startsAt <= now) &&
      (endsAt === null || endsAt >= now)
    );
  });
}
