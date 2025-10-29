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
        'nil', 'null', 'thread', 'spawn', 'join', 'public', 'pub', 'private', 'priv',
        'protected', 'prot', 'static', 'this', 'super', 'instanceof', 'enum',
        'record', 'try', 'catch', 'finally', 'throw', 'defer', 'switch', 'case',
        'default', 'where', 'from', 'as', 'export', 'extends', 'out'
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

        // Third pass: Enhanced type checking and unreachable code detection
        this.performTypeChecking(lines, diagnostics);
        this.detectUnreachableCode(lines, diagnostics);
        this.detectLogicalOperatorErrors(lines, diagnostics);
        this.detectRangeOperatorErrors(lines, diagnostics);
        this.detectStringInterpolationIssues(lines, diagnostics);

        diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Enhanced: Perform basic type checking on variable assignments and function calls
     */
    private performTypeChecking(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        const variableTypes = new Map<string, string>();
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Track variable declarations with explicit types
            const varDeclMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([A-Z][a-zA-Z0-9_<>,\s]*)/);
            if (varDeclMatch) {
                const varName = varDeclMatch[1];
                const varType = varDeclMatch[2].trim();
                variableTypes.set(varName, varType);
            }
            
            // Infer types from assignments
            const varAssignMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
            if (varAssignMatch && !variableTypes.has(varAssignMatch[1])) {
                const varName = varAssignMatch[1];
                const value = varAssignMatch[2].trim();
                const inferredType = this.inferType(value);
                if (inferredType) {
                    variableTypes.set(varName, inferredType);
                }
            }
            
            // Check type mismatches in assignments
            const reassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
            if (reassignMatch) {
                const varName = reassignMatch[1];
                const value = reassignMatch[2].trim();
                
                if (variableTypes.has(varName)) {
                    const expectedType = variableTypes.get(varName)!;
                    const actualType = this.inferType(value);
                    
                    if (actualType && !this.isTypeCompatible(expectedType, actualType)) {
                        const varIndex = line.indexOf(varName);
                        const range = new vscode.Range(i, varIndex, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Type mismatch: Cannot assign '${actualType}' to variable of type '${expectedType}'`,
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    }
                }
            }
            
            // Check for comparison with incompatible types
            const comparisonMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|<|>|<=|>=)\s*([a-zA-Z_][a-zA-Z0-9_]*|"[^"]*"|'[^']*'|\d+\.?\d*)/);
            if (comparisonMatch) {
                const left = comparisonMatch[1];
                const right = comparisonMatch[3];
                
                if (variableTypes.has(left)) {
                    const leftType = variableTypes.get(left)!;
                    const rightType = this.inferType(right);
                    
                    if (rightType && !this.isTypeCompatible(leftType, rightType) && !this.isTypeCompatible(rightType, leftType)) {
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Comparing incompatible types: '${leftType}' and '${rightType}'`,
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    }
                }
            }
            
            // Check for division by zero
            const divZeroMatch = line.match(/\/\s*(0)(?![\.0-9])/);
            if (divZeroMatch) {
                const divIndex = line.indexOf(divZeroMatch[0]);
                const range = new vscode.Range(i, divIndex, i, divIndex + divZeroMatch[0].length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Division by zero will cause runtime error',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    /**
     * Enhanced: Detect unreachable code after return, break, continue, or throw
     */
    private detectUnreachableCode(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            
            // Check if line contains unconditional control flow statements
            if (line.match(/^\s*(return|break|continue|throw)\b/) && !line.includes('//')) {
                // Check next non-empty, non-comment line
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    
                    // Skip empty lines and comments
                    if (!nextLine || nextLine.startsWith('//') || nextLine.startsWith('/*')) {
                        continue;
                    }
                    
                    // If we find 'end', 'elif', 'else', 'catch', 'finally', it's not unreachable
                    if (nextLine.match(/^\s*(end|elif|else|catch|finally)\b/)) {
                        break;
                    }
                    
                    // Otherwise, this is unreachable code
                    const range = new vscode.Range(j, 0, j, lines[j].length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Unreachable code detected',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                    break;
                }
            }
        }
    }

    /**
     * Enhanced: Detect usage of 'and', 'or', 'not' keywords which don't exist in Polyloft
     */
    private detectLogicalOperatorErrors(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Check for 'and' keyword (should be &&)
            let andMatch;
            const andRegex = /\band\b/g;
            while ((andMatch = andRegex.exec(line)) !== null) {
                const range = new vscode.Range(i, andMatch.index, i, andMatch.index + 3);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '&&' instead of 'and'. Polyloft does not have an 'and' keyword",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            
            // Check for 'or' keyword (should be ||)
            let orMatch;
            const orRegex = /\bor\b/g;
            while ((orMatch = orRegex.exec(line)) !== null) {
                const range = new vscode.Range(i, orMatch.index, i, orMatch.index + 2);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '||' instead of 'or'. Polyloft does not have an 'or' keyword",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            
            // Check for 'not' keyword (should be !)
            let notMatch;
            const notRegex = /\bnot\s+/g;
            while ((notMatch = notRegex.exec(line)) !== null) {
                const range = new vscode.Range(i, notMatch.index, i, notMatch.index + 3);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '!' instead of 'not'. Polyloft does not have a 'not' keyword",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    /**
     * Enhanced: Detect incorrect range operator (.. instead of ...)
     */
    private detectRangeOperatorErrors(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Check for .. (two dots) which is not valid in Polyloft
            let rangeTwoDotsMatch;
            const rangeRegex = /(\d+)\.\.(\d+)/g;
            while ((rangeTwoDotsMatch = rangeRegex.exec(line)) !== null) {
                // Make sure it's not ... (three dots)
                if (line[rangeTwoDotsMatch.index + rangeTwoDotsMatch[0].indexOf('..') + 2] !== '.') {
                    const dotIndex = rangeTwoDotsMatch.index + rangeTwoDotsMatch[0].indexOf('..');
                    const range = new vscode.Range(i, dotIndex, i, dotIndex + 2);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "Use '...' (three dots) for ranges, not '..' (two dots)",
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }
        }
    }

    /**
     * Enhanced: Detect issues with string interpolation
     */
    private detectStringInterpolationIssues(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Check for incorrect interpolation syntax (${} instead of #{})
            let wrongInterpMatch;
            const wrongInterpRegex = /\$\{[^}]+\}/g;
            while ((wrongInterpMatch = wrongInterpRegex.exec(line)) !== null) {
                const range = new vscode.Range(i, wrongInterpMatch.index, i, wrongInterpMatch.index + 2);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '#{expression}' for string interpolation, not '${expression}'",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            
            // Warn about unescaped # in strings (might be intended interpolation)
            let stringMatch;
            const stringRegex = /"([^"]*#[^{][^"]*)"/g;
            while ((stringMatch = stringRegex.exec(line)) !== null) {
                // Find the position of # within the matched string
                const hashPos = stringMatch[1].indexOf('#');
                if (hashPos !== -1) {
                    const absoluteHashPos = stringMatch.index + 1 + hashPos;  // +1 for opening quote
                    const range = new vscode.Range(i, absoluteHashPos, i, absoluteHashPos + 1);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "Did you mean to use string interpolation? Use '#{expression}' syntax",
                            vscode.DiagnosticSeverity.Hint
                        )
                    );
                }
            }
        }
    }

    /**
     * Infer the type from a value or expression
     */
    private inferType(value: string): string | undefined {
        value = value.trim();
        
        // String literals
        if (value.match(/^["'].*["']$/)) {
            return 'String';
        }
        
        // Numeric literals
        if (value.match(/^\d+$/)) {
            return 'Int';
        }
        if (value.match(/^\d+\.\d+$/)) {
            return 'Float';
        }
        
        // Boolean literals
        if (value === 'true' || value === 'false') {
            return 'Bool';
        }
        
        // Nil/null
        if (value === 'nil' || value === 'null') {
            return 'Any';  // nil can be any type
        }
        
        // Array literals
        if (value.match(/^\[.*\]$/)) {
            return 'Array';
        }
        
        // Map literals
        if (value.match(/^\{.*:.*\}$/)) {
            return 'Map';
        }
        
        return undefined;
    }

    /**
     * Check if two types are compatible for assignment
     */
    private isTypeCompatible(targetType: string, sourceType: string): boolean {
        // Exact match
        if (targetType === sourceType) {
            return true;
        }
        
        // Any can accept anything
        if (targetType === 'Any') {
            return true;
        }
        
        // Numeric promotions
        if (targetType === 'Float' && sourceType === 'Int') {
            return true;
        }
        if (targetType === 'Double' && (sourceType === 'Int' || sourceType === 'Float')) {
            return true;
        }
        
        return false;
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
