import * as vscode from 'vscode';

interface Token {
    type: string;
    value: string;
    line: number;
    column: number;
}

export class PolyloftLinter {
    private keywords = [
        'var', 'let', 'const', 'final', 'def', 'class', 'interface', 'import',
        'implements', 'abstract', 'sealed', 'return', 'if', 'elif', 'else',
        'for', 'in', 'loop', 'break', 'continue', 'end', 'do', 'true', 'false',
        'nil', 'thread', 'spawn', 'join', 'public', 'pub', 'private', 'priv',
        'protected', 'prot', 'static', 'this', 'super', 'instanceof', 'enum',
        'record', 'try', 'catch', 'finally', 'throw'
    ];

    public lint(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
        const config = vscode.workspace.getConfiguration('polyloft');
        if (!config.get('linting.enabled')) {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Track class and function definitions
        const classNames = new Set<string>();
        const functionNames = new Set<string>();
        const variableNames = new Set<string>();
        const constVariables = new Map<string, number>(); // Track const/final variables with line number
        const finalVariables = new Map<string, number>();

        // First pass: collect definitions
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Find class definitions
            const classMatch = line.match(/^\s*class\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classMatch) {
                classNames.add(classMatch[1]);
            }

            // Find function definitions
            const funcMatch = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (funcMatch) {
                functionNames.add(funcMatch[1]);
            }

            // Check for double declarators (e.g., "final const x")
            const doubleDeclaratorMatch = line.match(/^\s*(var|let|const|final)\s+(var|let|const|final)\s+/);
            if (doubleDeclaratorMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Cannot use multiple declarators (${doubleDeclaratorMatch[1]} ${doubleDeclaratorMatch[2]}). Use only one.`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Find variable declarations with const/final tracking
            const varMatch = line.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (varMatch && !doubleDeclaratorMatch) {
                const varType = varMatch[1];
                const varName = varMatch[2];
                variableNames.add(varName);
                
                if (varType === 'const') {
                    constVariables.set(varName, i);
                } else if (varType === 'final') {
                    finalVariables.set(varName, i);
                }
            }
        }

        // Second pass: check for errors
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for unclosed strings
            const stringMatches = line.match(/"/g);
            if (stringMatches && stringMatches.length % 2 !== 0) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Unclosed string literal',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for unmatched brackets
            const openBrackets = (line.match(/\{/g) || []).length;
            const closeBrackets = (line.match(/\}/g) || []).length;
            if (openBrackets !== closeBrackets) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Unmatched brackets',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for missing 'end' keyword after block statements
            if (line.match(/^\s*(def|class|interface|if|elif|else|for|loop|try|catch|finally)\b.*:\s*$/)) {
                // Look for corresponding 'end'
                let foundEnd = false;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/^\s*end\s*$/)) {
                        foundEnd = true;
                        break;
                    }
                    // Stop searching if we hit another block start at same or lower indentation
                    const currentIndent = line.match(/^\s*/)?.[0].length || 0;
                    const checkIndent = lines[j].match(/^\s*/)?.[0].length || 0;
                    if (checkIndent <= currentIndent && lines[j].match(/^\s*(def|class|interface|if|elif|else|for|loop|try|catch|finally)\b/)) {
                        break;
                    }
                }
                if (!foundEnd && !line.match(/^\s*(else|elif):/)) {
                    
                    const range = new vscode.Range(i, 0, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Block statement may be missing corresponding "end" keyword',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                }
            }

            // Check for invalid function/method declarations (missing parentheses)
            const invalidDefMatch = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?!\()/);
            if (invalidDefMatch && !line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Function definition must be followed by parameter list in parentheses',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for lowercase class names (convention warning)
            const classDefMatch = line.match(/^\s*(?:(?:public|private|protected|sealed|abstract)\s+)*class\s+([a-z][a-zA-Z0-9_]*)/);
            if (classDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Class names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase enum names (convention warning)
            const enumDefMatch = line.match(/^\s*(?:(?:public|private|protected|sealed)\s+)*enum\s+([a-z][a-zA-Z0-9_]*)/);
            if (enumDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Enum names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase record names (convention warning)
            const recordDefMatch = line.match(/^\s*(?:(?:public|private|protected)\s+)*record\s+([a-z][a-zA-Z0-9_]*)/);
            if (recordDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Record names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase interface names (convention warning)
            const interfaceDefMatch = line.match(/^\s*(?:(?:public|private|protected)\s+)*interface\s+([a-z][a-zA-Z0-9_]*)/);
            if (interfaceDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Interface names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for annotations without proper formatting
            const annotationMatch = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (annotationMatch) {
                // Verify the annotation is followed by a valid construct (method, class, etc.)
                let nextNonEmptyLine = '';
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine && !nextLine.startsWith('//') && !nextLine.startsWith('/*')) {
                        nextNonEmptyLine = nextLine;
                        break;
                    }
                }
                
                const validAnnotationTarget = nextNonEmptyLine.match(/^\s*(def|class|enum|record|interface|public|private|protected|static|abstract|sealed)\b/);
                if (!validAnnotationTarget && nextNonEmptyLine) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Annotations must be followed by a class, method, field, or other valid declaration',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                }
            }

            // Check for use of 'this' outside of class/enum/record methods
            if (line.includes('this.') && !this.isInsideClassLikeStructure(lines, i)) {
                const thisIndex = line.indexOf('this.');
                const range = new vscode.Range(i, thisIndex, i, thisIndex + 4);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        '"this" can only be used inside class, enum, or record methods',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for return outside function
            const returnMatch = line.match(/^\s*return\b/);
            if (returnMatch && !this.isInsideFunction(lines, i)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        '"return" statement outside of function',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for reassignment of const variables
            const constReassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
            if (constReassignMatch) {
                const varName = constReassignMatch[1];
                if (constVariables.has(varName)) {
                    const declLine = constVariables.get(varName)!;
                    const varIndex = line.indexOf(varName);
                    const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Cannot reassign const variable '${varName}' (declared on line ${declLine + 1})`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for reassignment of final variables
            const finalReassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
            if (finalReassignMatch) {
                const varName = finalReassignMatch[1];
                if (finalVariables.has(varName)) {
                    const declLine = finalVariables.get(varName)!;
                    const varIndex = line.indexOf(varName);
                    const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Cannot reassign final variable '${varName}' (declared on line ${declLine + 1})`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for break/continue outside of loops
            if (line.match(/^\s*(break|continue)\b/)) {
                if (!this.isInsideLoop(lines, i)) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    const keyword = line.match(/^\s*(break|continue)\b/)?.[1];
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `'${keyword}' statement can only be used inside loops`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for duplicate variable declarations
            const duplicateVarMatch = line.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (duplicateVarMatch) {
                const varName = duplicateVarMatch[2];
                // Check if variable was already declared earlier in the same scope
                for (let j = 0; j < i; j++) {
                    const prevLine = lines[j];
                    const prevMatch = prevLine.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                    if (prevMatch && prevMatch[2] === varName && this.isSameScope(lines, j, i)) {
                        const varIndex = line.indexOf(varName);
                        const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Variable '${varName}' is already declared in this scope (line ${j + 1})`,
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                        break;
                    }
                }
            }

            // Check for missing type annotation in function parameters (warning)
            const funcParamMatch = line.match(/^\s*def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]+)\)/);
            if (funcParamMatch) {
                const params = funcParamMatch[1];
                // Check if any parameter lacks type annotation
                const paramList = params.split(',').map(p => p.trim()).filter(p => p.length > 0);
                for (const param of paramList) {
                    if (!param.includes(':') && !param.match(/^\.\.\./)) { // Ignore variadic params
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Function parameters should have type annotations',
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                        break;
                    }
                }
            }

            // Return type is optional in Polyloft, so we don't warn about missing return types

            // Check for unreachable code after return
            if (line.match(/^\s*return\b/)) {
                // Look ahead for non-empty, non-comment lines before 'end'
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine === 'end' || nextLine === '') {
                        break;
                    }
                    if (!nextLine.startsWith('//') && !nextLine.startsWith('/*')) {
                        const range = new vscode.Range(j, 0, j, lines[j].length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Unreachable code after return statement',
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                        break;
                    }
                }
            }

            // Check for unused imports (warning)
            const importMatch = line.match(/^\s*import\s+[a-zA-Z._/]+\s*\{\s*([^}]+)\s*\}/);
            if (importMatch) {
                const symbols = importMatch[1].split(',').map(s => s.trim());
                for (const symbol of symbols) {
                    let used = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].includes(symbol)) {
                            used = true;
                            break;
                        }
                    }
                    if (!used) {
                        const symbolIndex = line.indexOf(symbol);
                        const range = new vscode.Range(i, symbolIndex, i, symbolIndex + symbol.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Imported symbol '${symbol}' is not used`,
                                vscode.DiagnosticSeverity.Hint
                            )
                        );
                    }
                }
            }

            // Check for inconsistent indentation (warning)
            if (line.trim().length > 0 && !line.trim().startsWith('//')) {
                const indent = line.match(/^\s*/)?.[0].length || 0;
                if (indent % 4 !== 0) {
                    const range = new vscode.Range(i, 0, i, indent);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Inconsistent indentation (should be multiples of 4 spaces)',
                            vscode.DiagnosticSeverity.Hint
                        )
                    );
                }
            }
        }

        diagnosticCollection.set(document.uri, diagnostics);
    }

    private isInsideClassLikeStructure(lines: string[], currentLine: number): boolean {
        // Walk backwards to find enclosing structures
        let blockLevel = 0;
        let foundDefOrConstructor = false;
        let foundClassLike = false;
        let className = '';
        
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track block nesting
            if (line.match(/^\s*end\s*$/)) {
                blockLevel++;
            }
            
            // Check for def (method) or constructor
            if (!foundDefOrConstructor && blockLevel === 0) {
                // Check for regular method (including private/public modifiers)
                if (line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?def\s+/)) {
                    foundDefOrConstructor = true;
                    continue; // Keep looking for class/enum/record
                }
                // Check for constructor (ClassName(params):)
                const constructorMatch = line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*$/);
                if (constructorMatch) {
                    className = constructorMatch[1];
                    foundDefOrConstructor = true;
                    continue; // Keep looking for class/enum/record
                }
            }
            
            // Check for class, enum, or record
            const classLikeMatch = line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|sealed|abstract)\s+)*(class|enum|record)\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classLikeMatch && blockLevel === 0) {
                foundClassLike = true;
                const foundClassName = classLikeMatch[2];
                // If we found a constructor, verify it matches this class/enum/record name
                if (className && className !== foundClassName) {
                    foundDefOrConstructor = false; // Constructor doesn't match, keep looking
                }
                if (foundDefOrConstructor) {
                    break;
                }
            }
            
            // Track block starts (going backwards, so these opened blocks)
            if (line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?def\s+.*:\s*$/) ||
                line.match(/^\s*(if|elif|else|for|loop|try|catch|finally|class|enum|record)\b.*:\s*$/) || 
                line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*$/)) {
                blockLevel--;
                if (blockLevel < 0) {
                    // We've gone too far back
                    break;
                }
            }
        }
        
        // 'this' is valid if we're inside a method or constructor that's inside a class/enum/record
        return foundDefOrConstructor && foundClassLike;
    }

    private isInsideFunction(lines: string[], currentLine: number): boolean {
        let blockLevel = 0;
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track end keywords (we're exiting a block going backwards, need to skip it)
            if (line.match(/^\s*end\s*$/)) {
                blockLevel++;
            }
            
            // Check for thread spawn do blocks (these are function-like contexts where return is valid)
            if (line.match(/thread\s+spawn\s+do\s*$/)) {
                if (blockLevel > 0) {
                    blockLevel--;
                } else {
                    // We're inside a thread spawn block, which allows return statements
                    return true;
                }
            }
            
            // Track block starts (including private/public modifiers)
            const blockStartMatch = line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?(def|if|elif|else|for|loop|try|catch|finally)\b.*:\s*$/);
            if (blockStartMatch) {
                if (blockLevel > 0) {
                    // We're exiting a block we were skipping
                    blockLevel--;
                } else {
                    // We're at the opening of a block we're currently inside
                    // Check if it's a def
                    if (blockStartMatch[1] === 'def') {
                        return true;
                    }
                    // Otherwise, we've reached a block boundary without finding a def
                    // This means we're inside this block (if/for/etc) but not inside a function
                    // Continue looking outside this block
                }
            }
            
            // Also check for constructor pattern (ClassName(params):)
            const constructorMatch = line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*$/);
            if (constructorMatch) {
                if (blockLevel > 0) {
                    blockLevel--;
                } else {
                    // We're inside a constructor, which is like a function
                    return true;
                }
            }
        }
        return false;
    }

    private isInsideLoop(lines: string[], currentLine: number): boolean {
        let blockLevel = 0;
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track end keywords (we're exiting a block going backwards, need to skip it)
            if (line.match(/^\s*end\s*$/)) {
                blockLevel++;
            }
            
            // Check for loop start (for or loop)
            if (line.match(/^\s*(for|loop)\b.*:\s*$/)) {
                if (blockLevel > 0) {
                    // We're exiting a block we were skipping
                    blockLevel--;
                } else {
                    // We're at the opening of a loop we're currently inside
                    return true;
                }
            }
            
            // Track other block starts
            if (line.match(/^\s*(if|elif|else|def|try|catch|finally|class|enum|record)\b.*:\s*$/) ||
                line.match(/^\s*do\s*$/)) {
                if (blockLevel > 0) {
                    blockLevel--;
                }
            }
        }
        return false;
    }

    private isSameScope(lines: string[], line1: number, line2: number): boolean {
        // Simple scope check - if both lines have same indentation level and no scope changes between them
        const indent1 = lines[line1].match(/^\s*/)?.[0].length || 0;
        const indent2 = lines[line2].match(/^\s*/)?.[0].length || 0;
        
        if (indent1 !== indent2) {
            return false;
        }

        // Check if there's a scope change between the two lines
        for (let i = line1 + 1; i < line2; i++) {
            const line = lines[i];
            if (line.match(/^\s*(def|class|interface|if|for|loop|try)\b.*:\s*$/)) {
                // New scope opened
                return false;
            }
        }

        return true;
    }
}
