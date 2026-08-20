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
 *
 * BMP only. The pattern carries no `u` flag, so an astral character matches as
 * two surrogate halves that are escaped separately and reassemble correctly.
 * Adding `u` would make each pair match as a single unit and drop its low half.
 */
const UNSAFE_PATTERN = /[<>\u2028\u2029]/g;

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
    // The escape is derived from the character itself, so there is no table to
    // fall out of sync with the pattern. `toUpperCase` is load-bearing — the
    // emitted text must stay byte-identical to the previous output.
    //   '<'    -> 60   -> '3c'   -> '3C'   -> '003C'
    //   '>'    -> 62   -> '3e'   -> '3E'   -> '003E'
    //   U+2028 -> 8232 -> '2028' -> '2028' -> '2028'
    //   U+2029 -> 8233 -> '2029' -> '2029' -> '2029'
    (char) =>
      `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
  );
}
