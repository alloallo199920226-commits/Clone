/* Presentation only: never a provider reference, proof, or backend identifier.
   Deterministic for a saved payment; not secret, not guaranteed unique. */
(() => {
  window.paymentDisplayNumber = value => {
    const source = String(value || "");
    if (!source) return "—";
    let hash = 14695981039346656037n;
    for (const character of source) {
      hash ^= BigInt(character.codePointAt(0));
      hash = BigInt.asUintN(64, hash * 1099511628211n);
    }
    return String(10000000000n + hash % 90000000000n);
  };
})();
