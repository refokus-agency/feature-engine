/** Every value type that can reach `buildEntry`, per `ParsedFeatureMeta`'s guarantees. */
export type SerializableMetaValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

/**
 * Characters that are safe inside JSON but unsafe once the JSON text is
 * embedded in JavaScript source: `<`/`>` can terminate an enclosing HTML
 * `<script>` element, and U+2028/U+2029 are line terminators that break out of
 * a string literal on pre-ES2019 parsers.
 *
 * `/` is deliberately absent — it cannot terminate a script element on its own,
 * and escaping it would change the emitted text of every discovered file path.
 */
const UNSAFE_CHARS = {
  '<': '\\u003C',
  '>': '\\u003E',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
} as const;

/** Character class must stay in sync with the keys of `UNSAFE_CHARS`. */
const UNSAFE_PATTERN = /[<>\u2028\u2029]/g;

type UnsafeChar = keyof typeof UNSAFE_CHARS;

/**
 * Serialize a metadata value into a JavaScript source literal that cannot
 * escape its string context.
 *
 * Post-processes `JSON.stringify` output rather than reimplementing
 * serialization. That is safe because JSON's structural characters are
 * `{}[]",:` and whitespace — none of the escaped characters can occur outside
 * string contents.
 */
export function serializeForCodeContext(value: SerializableMetaValue): string {
  return JSON.stringify(value).replace(
    UNSAFE_PATTERN,
    // Safe cast: the pattern only ever matches keys of UNSAFE_CHARS.
    (char) => UNSAFE_CHARS[char as UnsafeChar],
  );
}
