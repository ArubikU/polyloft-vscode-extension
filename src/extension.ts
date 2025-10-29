import * as vscode from 'vscode';
import { PolyloftLinter } from './linter';
import { PolyloftCompletionProvider } from './completion';
import { PolyloftDefinitionProvider } from './definition';
import { PolyloftHoverProvider } from './hover';
import * as child_process from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Polyloft extension is now active');

    // Register linter
    const linter = new PolyloftLinter();
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('polyloft');
    context.subscriptions.push(diagnosticCollection);

    // Lint on open, save, and change
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'polyloft') {
                linter.lint(document, diagnosticCollection);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'polyloft') {
                linter.lint(document, diagnosticCollection);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'polyloft') {
                const config = vscode.workspace.getConfiguration('polyloft');
                if (config.get('linting.onType')) {
                    linter.lint(event.document, diagnosticCollection);
                }
            }
        })
    );

    // Lint all open Polyloft files on activation
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'polyloft') {
            linter.lint(document, diagnosticCollection);
        }
    });

    // Register completion provider
    const completionProvider = new PolyloftCompletionProvider(context);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'polyloft' },
            completionProvider,
            '.', // Trigger on dot for member access
            ' '  // Trigger on space for general completion
        )
    );

    // Register definition provider (Go to Definition)
    const definitionProvider = new PolyloftDefinitionProvider();
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { scheme: 'file', language: 'polyloft' },
            definitionProvider
        )
    );

    // Register hover provider
    const hoverProvider = new PolyloftHoverProvider(context);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { scheme: 'file', language: 'polyloft' },
            hoverProvider
        )
    );

    // Register Run File command
    const runFileCommand = vscode.commands.registerCommand('polyloft.runFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active Polyloft file');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'polyloft') {
            vscode.window.showErrorMessage('Current file is not a Polyloft file');
            return;
        }

        // Save the file first
        if (document.isDirty) {
            await document.save();
        }

        const filePath = document.uri.fsPath;
        const fileName = path.basename(filePath);
        
        // Check if polyloft CLI is available
        const config = vscode.workspace.getConfiguration('polyloft');
        const polyloftCommand = config.get<string>('interpreterPath') || 'polyloft';

        // Create or show output channel
        const outputChannel = vscode.window.createOutputChannel('Polyloft');
        outputChannel.clear();
        outputChannel.show(true);

        outputChannel.appendLine(`Running ${fileName}...`);
        outputChannel.appendLine('');

        try {
            const child = child_process.spawn(polyloftCommand, ['run', filePath], {
                cwd: path.dirname(filePath),
                shell: true
            });

            child.stdout.on('data', (data) => {
                outputChannel.append(data.toString());
            });

            child.stderr.on('data', (data) => {
                outputChannel.append(data.toString());
            });

            child.on('error', (error) => {
                outputChannel.appendLine('');
                outputChannel.appendLine(`Error: ${error.message}`);
                if (error.message.includes('ENOENT')) {
                    outputChannel.appendLine('');
                    outputChannel.appendLine('Polyloft CLI not found. Please install it or set "polyloft.interpreterPath" in settings.');
                }
            });

            child.on('close', (code) => {
                outputChannel.appendLine('');
                if (code === 0) {
                    outputChannel.appendLine(`Finished with exit code ${code}`);
                } else {
                    outputChannel.appendLine(`Exited with code ${code}`);
                }
            });
        } catch (error: any) {
            outputChannel.appendLine('');
            outputChannel.appendLine(`Failed to run: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to run Polyloft file: ${error.message}`);
        }
    });

    context.subscriptions.push(runFileCommand);
}

export function deactivate() {
    console.log('Polyloft extension is now deactivated');
}
