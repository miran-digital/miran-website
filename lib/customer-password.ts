const LOWERCASE = /[a-z]/;
const UPPERCASE = /[A-Z]/;
const NUMBER = /[0-9]/;
const SYMBOL = /[^A-Za-z0-9\s]/;

export function customerPasswordError(value: unknown) {
  if (typeof value !== "string" || value.length < 10) {
    return "رمز عبور باید حداقل ۱۰ نویسه باشد.";
  }
  if (
    !LOWERCASE.test(value) ||
    !UPPERCASE.test(value) ||
    !NUMBER.test(value) ||
    !SYMBOL.test(value)
  ) {
    return "رمز عبور باید شامل حروف کوچک و بزرگ انگلیسی، عدد و نشانه باشد.";
  }
  return null;
}
