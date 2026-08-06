import { registerWebview } from '@easy_vscode/webview'
import PreviewImages from './PreviewImages'
import SingleImageViewer from './SingleImageViewer'
import { AntdWebviewShell } from './AntdWebviewShell'

const webviewComponents = {
  PreviewImages,
  SingleImageViewer
}

registerWebview(webviewComponents, { Root: AntdWebviewShell })
