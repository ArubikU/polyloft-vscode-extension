import * as vscode from 'vscode';
import { PolyloftLinter } from './linter';
import { PolyloftCompletionProvider } from './completion';
import { PolyloftDefinitionProvider } from './definition';
import { PolyloftHoverProvider } from './hover';

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
}

export function deactivate() {
    console.log('Polyloft extension is now deactivated');
}
