/** Shared destinations; the host chooses URLs rather than accepting arbitrary webview URIs. */
export const REPOSITORY_URL = 'https://github.com/ZhangJian1713/vscode-image-viewer'
export const ISSUES_URL = `${REPOSITORY_URL}/issues`
export const FEEDBACK_EMAIL = 'zhangjian1713@gmail.com'

export type FeedbackAction = 'repository' | 'issues' | 'newIssue' | 'email'

export function feedbackUrl(action: unknown, version: string): string {
  switch (action) {
    case 'repository': return REPOSITORY_URL
    case 'issues': return ISSUES_URL
    case 'newIssue': return `${ISSUES_URL}/new`
    case 'email': return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`Image Viewer v${version} feedback`)}`
    default: throw new Error('Unknown feedback action.')
  }
}
