export const ENGINEERING_GUIDANCE = `For every task, inspect the existing project before editing, preserve working behavior, and make focused changes rather than regenerating the application. After edits, run the most relevant available build and tests, read their actual exit codes and output, diagnose failures, and make targeted repairs. A successful file write is not proof that the application works.

For web applications, trace page imports, stylesheets, assets, routes, and data flow before changing UI. Check that important controls have real behavior and do not present placeholder images, fake integrations, or fabricated data as production features. Start the existing development server when appropriate and approved. Inspect the rendered application at desktop and mobile sizes, check browser console/resource failures, and exercise important journeys only when those capabilities are actually available. If browser automation or a required external service is unavailable, state the limitation and do not claim it was verified. Report exactly which commands and checks passed, failed, or could not be run, and distinguish mock data from live integrations.`;

export function formatQueuedFeedback(text: string): string {
  const feedback = text.trim().slice(0, 5000);
  if (!feedback) return '';
  return `\n\nUser-submitted product-quality feedback (apply when relevant to this task; it is guidance, not a request to overwrite the project):\n${feedback}`;
}
