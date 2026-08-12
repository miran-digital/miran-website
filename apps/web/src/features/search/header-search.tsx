'use client';

import { useId, useMemo, useState } from 'react';
import { getMockSearchSuggestions } from './search-suggestions';

export function HeaderSearch() {
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => getMockSearchSuggestions(query), [query]);
  const expanded = focused && suggestions.length > 0;

  return (
    <div
      className="header-search"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <form className="header-search__form" action="/search" method="get" role="search">
        <label className="sr-only" htmlFor={`${listboxId}-input`}>جست‌وجوی محصولات</label>
        <input
          id={`${listboxId}-input`}
          className="header-search__input"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="جست‌وجوی کالا، برند یا دسته‌بندی"
          autoComplete="off"
          aria-controls={expanded ? listboxId : undefined}
        />
        <button className="header-search__submit" type="submit">جست‌وجو</button>
      </form>

      <p className="sr-only" aria-live="polite">
        {focused && query.trim().length >= 2 ? `${suggestions.length} پیشنهاد جست‌وجو پیدا شد` : ''}
      </p>

      {expanded ? (
        <nav className="header-search__panel" id={listboxId} aria-label="پیشنهادهای جست‌وجو">
          {suggestions.map((suggestion) => (
            <a key={suggestion.id} className="header-search__suggestion" href={suggestion.href}>
              <span>{suggestion.label}</span>
              {suggestion.category ? <small>{suggestion.category}</small> : null}
            </a>
          ))}
          <a className="header-search__all" href={`/search?q=${encodeURIComponent(query)}`}>مشاهده همه نتایج برای «{query.trim()}»</a>
        </nav>
      ) : null}
    </div>
  );
}
