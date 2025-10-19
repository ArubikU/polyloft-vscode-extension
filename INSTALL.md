# Installing the Polyloft VSCode Extension

## Development Installation

To install the extension for development or testing:

1. **Install Dependencies**
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Compile the Extension**
   ```bash
   npm run compile
   ```

3. **Install in VSCode**
   
   Option A: Using the VSCode Command Line
   ```bash
   code --install-extension vscode-extension
   ```
   
   Option B: Manual Installation
   - Open VSCode
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Developer: Install Extension from Location"
   - Select the `vscode-extension` folder

4. **Reload VSCode**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Developer: Reload Window"

## Production Installation

To package and install the extension for production use:

1. **Install vsce** (if not already installed)
   ```bash
   npm install -g @vscode/vsce
   ```

2. **Package the Extension**
   ```bash
   cd vscode-extension
   vsce package
   ```
   
   This will create a `.vsix` file (e.g., `polyloft-language-support-0.1.0.vsix`)

3. **Install the VSIX Package**
   ```bash
   code --install-extension polyloft-language-support-0.1.0.vsix
   ```
   
   Or through VSCode UI:
   - Open VSCode
   - Go to Extensions view (`Ctrl+Shift+X`)
   - Click on the `...` menu at the top
   - Select "Install from VSIX..."
   - Choose the `.vsix` file

## Publishing to VSCode Marketplace

To publish the extension to the Visual Studio Code Marketplace:

1. **Create a Publisher Account**
   - Go to https://marketplace.visualstudio.com/
   - Sign in with your Microsoft account
   - Create a publisher ID

2. **Get a Personal Access Token**
   - Go to https://dev.azure.com/
   - Create a Personal Access Token with Marketplace (Publish) scope

3. **Login with vsce**
   ```bash
   vsce login <publisher-name>
   ```

4. **Publish**
   ```bash
   cd vscode-extension
   vsce publish
   ```

## Verifying Installation

After installation:

1. Open a `.pf` file in VSCode
2. You should see:
   - Syntax highlighting
   - Auto-completion suggestions
   - Error markers (if any)
   - Hover information on keywords and functions

## Troubleshooting

**Extension not loading:**
- Check VSCode output panel (View > Output > Select "Polyloft Language Support")
- Ensure the extension is enabled in Extensions view
- Try reloading the window

**Auto-completion not working:**
- Check settings: `polyloft.completion.enabled` should be `true`
- Ensure the file has `.pf` extension

**Linting not working:**
- Check settings: `polyloft.linting.enabled` should be `true`
- Save the file to trigger linting

## Configuration

You can configure the extension in VSCode settings (`Ctrl+,` or `Cmd+,`):

```json
{
  "polyloft.linting.enabled": true,
  "polyloft.linting.onType": true,
  "polyloft.completion.enabled": true
}
```
