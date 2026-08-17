/**
 * "1 row" against "2 rows". Small, but wrong in a way readers notice, and the
 * second screen to need it is what makes it worth having in one place.
 *
 * Sibilant endings take `es`, which is the one rule this actually needs:
 * `punch` is the noun S-11 counts most often, and the inline version this
 * replaced rendered it "2 punchs". Anything genuinely irregular should be
 * written out at the call site rather than guessed at here.
 */
const SIBILANT = /(?:ch|sh|s|x|z)$/;

export function plural(count, noun) {
  if (count === 1) return `${count} ${noun}`;
  return `${count} ${noun}${SIBILANT.test(noun) ? 'es' : 's'}`;
}
