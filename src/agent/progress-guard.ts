export class RepeatedPlanGuard {
  private previousSignature = '';

  isRepeated(actions: unknown[]): boolean {
    if (actions.length === 0) return false;
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, normalize(nested)]),
        );
      }
      return value;
    };
    const signature = JSON.stringify(normalize(actions));
    const repeated = signature === this.previousSignature;
    this.previousSignature = signature;
    return repeated;
  }
}
