import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class PolyloftDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // Check if we're on an import statement and clicking the module path
        const importLineMatch = lineText.match(/^\s*import\s+([a-zA-Z._\/]+)\s*\{/);
        if (importLineMatch) {
            const importPath = importLineMatch[1];
            // Use the match to find the exact position - the path starts after "import "
            const importKeywordMatch = lineText.match(/^\s*import\s+/);
            if (importKeywordMatch) {
                const importPathStart = importKeywordMatch[0].length;
                const importPathEnd = importPathStart + importPath.length;
                
                // Check if cursor is within the import path
                if (position.character >= importPathStart && position.character <= importPathEnd) {
                    // Try to open the imported file
                    const location = await this.resolveImport(document, importPath, undefined);
                    if (location) {
                        return location;
                    }
                }
            }
        }
        
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        const text = document.getText();
        
        // Escape special regex characters in word to prevent ReDoS attacks
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Look for class definition
        const classMatch = text.match(new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${escapedWord}\\b`, 'g'));
        if (classMatch) {
            const index = text.indexOf(classMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for enum definition
        const enumMatch = text.match(new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${escapedWord}\\b`, 'g'));
        if (enumMatch) {
            const index = text.indexOf(enumMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for record definition
        const recordMatch = text.match(new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${escapedWord}\\b`, 'g'));
        if (recordMatch) {
            const index = text.indexOf(recordMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for interface definition
        const interfaceMatch = text.match(new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${escapedWord}\\b`, 'g'));
        if (interfaceMatch) {
            const index = text.indexOf(interfaceMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for function definition
        const funcMatch = text.match(new RegExp(`def\\s+${escapedWord}\\s*\\(`, 'g'));
        if (funcMatch) {
            const index = text.indexOf(funcMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for variable definition
        const varMatch = text.match(new RegExp(`(?:var|let|const|final)\\s+${escapedWord}\\b`, 'g'));
        if (varMatch) {
            const index = text.indexOf(varMatch[0]);
            const pos = document.positionAt(index);
            return new vscode.Location(document.uri, pos);
        }

        // Look for import and try to resolve to file
        const importMatch = text.match(new RegExp(`import\\s+([a-zA-Z._\/]+)\\s*\\{[^}]*${escapedWord}[^}]*\\}`, 'g'));
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
        symbol: string | undefined
    ): Promise<vscode.Location | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        // Convert import path to file system path (matching Polyloft interpreter logic)
        // import math.vector { Vec2 } -> libs/math/vector/index.pf or libs/math/vector/vector.pf
        // import utils { Planet } -> src/utils.pf or libs/utils.pf
        const rel = importPath.replace(/\./g, '/');
        const basePath = workspaceFolder.uri.fsPath;
        const possiblePaths: string[] = [];
        
        // If we have a current file context, try relative imports from current directory first
        const currentDir = path.dirname(document.uri.fsPath);
        possiblePaths.push(
            path.join(currentDir, rel + '.pf'),                           // same directory: helper.pf
            path.join(currentDir, rel, 'index.pf'),                       // subdirectory with index
            path.join(currentDir, rel, path.basename(rel) + '.pf')        // subdirectory/subdirectory.pf
        );
        
        // Standard library paths
        possiblePaths.push(
            // libs directory
            path.join(basePath, 'libs', rel + '.pf'),                     // libs/math/vector.pf (single file)
            path.join(basePath, 'libs', rel, 'index.pf'),                 // libs/math/vector/index.pf (public API aggregator)
            path.join(basePath, 'libs', rel, path.basename(rel) + '.pf'), // libs/math/vector/vector.pf
            // src directory
            path.join(basePath, 'src', rel + '.pf'),
            path.join(basePath, 'src', rel, 'index.pf')
        );
        
        // Try global library paths (~/.polyloft/)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const globalLib = path.join(homeDir, '.polyloft', 'libs');
            const globalSrc = path.join(homeDir, '.polyloft', 'src');
            
            possiblePaths.push(
                path.join(globalLib, rel + '.pf'),
                path.join(globalLib, rel, 'index.pf'),
                path.join(globalLib, rel, path.basename(rel) + '.pf'),
                path.join(globalSrc, rel + '.pf'),
                path.join(globalSrc, rel, 'index.pf')
            );
        }

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                const fileUri = vscode.Uri.file(filePath);
                
                // If no symbol specified, just open the file
                if (!symbol) {
                    return new vscode.Location(fileUri, new vscode.Position(0, 0));
                }
                
                const fileDocument = await vscode.workspace.openTextDocument(fileUri);
                const fileText = fileDocument.getText();

                // Escape special regex characters in symbol to prevent ReDoS attacks
                const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Find the symbol in the file - check all possible definition types
                // Check for class
                const classMatch = fileText.match(new RegExp(`(?:(?:public|private|protected|sealed|abstract)\\s+)*class\\s+${escapedSymbol}\\b`));
                if (classMatch) {
                    const index = fileText.indexOf(classMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for enum
                const enumMatch = fileText.match(new RegExp(`(?:(?:public|private|protected|sealed)\\s+)*enum\\s+${escapedSymbol}\\b`));
                if (enumMatch) {
                    const index = fileText.indexOf(enumMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for record
                const recordMatch = fileText.match(new RegExp(`(?:(?:public|private|protected)\\s+)*record\\s+${escapedSymbol}\\b`));
                if (recordMatch) {
                    const index = fileText.indexOf(recordMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for interface
                const interfaceMatch = fileText.match(new RegExp(`(?:(?:public|private|protected)\\s+)*interface\\s+${escapedSymbol}\\b`));
                if (interfaceMatch) {
                    const index = fileText.indexOf(interfaceMatch[0]);
                    const pos = fileDocument.positionAt(index);
                    return new vscode.Location(fileUri, pos);
                }

                // Check for function
                const funcMatch = fileText.match(new RegExp(`def\\s+${escapedSymbol}\\s*\\(`));
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
