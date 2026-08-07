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
    <div className="header-search">
      <form className="header-search__form" action="/search" method="get" role="search">
        <label className="sr-only" htmlFor={`${listboxId}-input`}>جست‌وجوی محصولات</label>
        <input
          id={`${listboxId}-input`}
          className="header-search__input"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="جست‌وجوی کالا، برند یا دسته‌بندی"
          autoComplete="off"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
        />
        <button className="header-search__submit" type="submit">جست‌وجو</button>
      </form>

      {expanded ? (
        <div className="header-search__panel" id={listboxId} role="listbox" aria-label="پیشنهادهای جست‌وجو">
          {suggestions.map((suggestion) => (
            <a key={suggestion.id} className="header-search__suggestion" href={suggestion.href} role="option">
              <span>{suggestion.label}</span>
              {suggestion.category ? <small>{suggestion.category}</small> : null}
            </a>
          ))}
          <a className="header-search__all" href={`/search?q=${encodeURIComponent(query)}`}>مشاهده همه نتایج برای «{query.trim()}»</a>
        </div>
      ) : null}
    </div>
  );
}
