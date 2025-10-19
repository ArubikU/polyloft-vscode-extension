import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class PolyloftDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        const text = document.getText();

        // Look for class definition
        const classMatch = text.match(new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${word}\\b`, 'g'));
        if (classMatch) {
            const index = text.indexOf(classMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for enum definition
        const enumMatch = text.match(new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${word}\\b`, 'g'));
        if (enumMatch) {
            const index = text.indexOf(enumMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for record definition
        const recordMatch = text.match(new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${word}\\b`, 'g'));
        if (recordMatch) {
            const index = text.indexOf(recordMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for interface definition
        const interfaceMatch = text.match(new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${word}\\b`, 'g'));
        if (interfaceMatch) {
            const index = text.indexOf(interfaceMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for function definition
        const funcMatch = text.match(new RegExp(`def\\s+${word}\\s*\\(`, 'g'));
        if (funcMatch) {
            const index = text.indexOf(funcMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for variable definition
        const varMatch = text.match(new RegExp(`(?:var|let|const|final)\\s+${word}\\b`, 'g'));
        if (varMatch) {
            const index = text.indexOf(varMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for import and try to resolve to file
        const importMatch = text.match(new RegExp(`import\\s+([a-zA-Z._\/]+)\\s*\\{[^}]*${word}[^}]*\\}`, 'g'));
        if (importMatch) {
            const fullMatch = importMatch[0];
            const pathMatch = fullMatch.match(/import\s+([a-zA-Z._\/]+)/);
            if (pathMatch) {
                const importPath = pathMatch[1];
                const location = await this.resolveImport(document, importPath, word);
                if (location) {
                    return location;
                }
            }
        }

        return undefined;
    }

    private async resolveImport(
        document: vscode.TextDocument,
        importPath: string,
        symbol: string
    ): Promise<vscode.Location | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        // Convert import path to file system path
        // import math.vector { Vec2 } -> libs/math/vector/index.pf or libs/math/vector/Vec2.pf
        // import utils { Planet } -> src/utils.pf or libs/utils.pf
        const parts = importPath.split('.');
        const basePath = workspaceFolder.uri.fsPath;
        
        // Try multiple resolution strategies
        const possiblePaths = [
            // Try libs folder first
            path.join(basePath, 'libs', ...parts, 'index.pf'),
            path.join(basePath, 'libs', ...parts, `${symbol}.pf`),
            path.join(basePath, 'libs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.pf`),
            // Try src folder for local imports
            path.join(basePath, 'src', `${importPath}.pf`),
            path.join(basePath, 'src', ...parts, 'index.pf'),
            path.join(basePath, 'src', ...parts, `${symbol}.pf`),
            // Try root level
            path.join(basePath, `${importPath}.pf`),
            path.join(basePath, ...parts, 'index.pf'),
            path.join(basePath, ...parts, `${symbol}.pf`),
        ];

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                const fileUri = vscode.Uri.file(filePath);
                const fileDocument = await vscode.workspace.openTextDocument(fileUri);
                const fileText = fileDocument.getText();

                // Find the symbol in the file - check all possible definition types
                // Check for class
                const classMatch = fileText.match(new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${symbol}\\b`));
                if (classMatch) {
                    const index = fileText.indexOf(classMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for enum
                const enumMatch = fileText.match(new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${symbol}\\b`));
                if (enumMatch) {
                    const index = fileText.indexOf(enumMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for record
                const recordMatch = fileText.match(new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${symbol}\\b`));
                if (recordMatch) {
                    const index = fileText.indexOf(recordMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for interface
                const interfaceMatch = fileText.match(new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${symbol}\\b`));
                if (interfaceMatch) {
                    const index = fileText.indexOf(interfaceMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for function
                const funcMatch = fileText.match(new RegExp(`def\\s+${symbol}\\s*\\(`));
                if (funcMatch) {
                    const index = fileText.indexOf(funcMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // If found file but not symbol, return file location
                return new vscode.Location(fileUri, new vscode.Position(0, 0));
            }
        }

        return undefined;
    }
}
