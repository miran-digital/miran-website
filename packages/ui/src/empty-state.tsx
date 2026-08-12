import type { ReactNode } from 'react';

type StateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <section className="miran-state">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="miran-state__action">{action}</div> : null}
    </section>
  );
}
