type SearchInputProps = {
  action?: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  buttonLabel?: string;
  className?: string;
};

export function SearchInput({
  action = '/search',
  name = 'q',
  defaultValue,
  placeholder = 'جست‌وجو در Miran',
  ariaLabel = 'جست‌وجوی محصولات',
  buttonLabel = 'جست‌وجو',
  className = ''
}: SearchInputProps) {
  return (
    <form className={`miran-search ${className}`.trim()} role="search" action={action} method="get">
      <label className="miran-visually-hidden" htmlFor="miran-search-input">{ariaLabel}</label>
      <input id="miran-search-input" className="miran-search__input" type="search" name={name} defaultValue={defaultValue} placeholder={placeholder} autoComplete="off" />
      <button className="miran-search__button" type="submit">{buttonLabel}</button>
    </form>
  );
}
