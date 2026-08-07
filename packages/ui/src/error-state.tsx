import type { ReactNode } from 'react';

type ErrorStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <section className="miran-state miran-state--error" role="alert" aria-labelledby="error-state-title">
      <h2 id="error-state-title">{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="miran-state__action">{action}</div> : null}
    </section>
  );
}
