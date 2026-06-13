class LiveCodingApp {
    constructor() {
        this.isTyping = false;
        this.isPaused = false;
        this.typedContent = '';
        this.typingSpeed = this.calculateTypingSpeed(70); // Default 70% = ~30ms
        this.userScrolled = false;
        this.totalChars = 0;
        this.currentChars = 0;
        // Parsed content storage
        this.parsedData = {
            title: '',
            style: '',
            body: '',
            hasErrors: false,
            errors: []
        };
        // Preview update interval
        this.previewInterval = null;
        // Smooth resize animation
        this.resizeAnimationId = null;
        this.targetWidth = 300;
        this.init();
    }

    // Splash Screen initialization
    initSplashScreen() {
        const splash = document.getElementById('splash-screen');
        const mainContainer = document.getElementById('main-container');

        if (!splash) return;

        // Hide splash screen after animation completes
        setTimeout(() => {
            splash.classList.add('hidden');
            if (mainContainer) {
                mainContainer.classList.add('visible');
                mainContainer.style.opacity = '1';
            }

            // Remove splash from DOM after transition
            setTimeout(() => {
                if (splash.parentNode) {
                    splash.parentNode.removeChild(splash);
                }
            }, 500);
        }, 2000); // Show for 2 seconds to see logo animation
    }

    init() {
        // Initialize splash screen
        this.initSplashScreen();

        this.speedSlider = document.getElementById('speed');
        this.previewScaleSlider = document.getElementById('preview-scale');
        this.progressValue = document.getElementById('progress-value');
        this.inputCode = document.getElementById('input-code');
        this.inputHighlight = document.getElementById('input-highlight');
        this.typedCode = document.getElementById('typed-code');
        this.preview = document.getElementById('preview');
        this.previewContainer = document.getElementById('preview-wrapper');
        this.codeDisplay = document.querySelector('.code-display');
        this.errorDisplay = document.getElementById('error-display');
        this.inputLineNumbers = document.getElementById('input-line-numbers');
        this.outputLineNumbers = document.getElementById('output-line-numbers');

        // Speed slider - linear from 200ms to 0.5ms
        // Update display and typing speed
        this.speedSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.typingSpeed = this.calculateTypingSpeed(val);
            this.updateSpeedDisplay(val);
        });
        // Initialize display
        this.updateSpeedDisplay(70);

        // Preview scale
        this.previewScaleSlider.addEventListener('input', (e) => {
            this.updatePreviewScale(parseInt(e.target.value));
        });

        // Mouse drag
        this.initPreviewDrag();

        // Line numbers sync and highlighting
        this.inputCode.addEventListener('input', () => {
            this.updateInputLineNumbers();
            this.highlightInput();
            // Auto-parse on input
            this.parseInputCode();
        });
        this.inputCode.addEventListener('scroll', () => this.syncInputScroll());

        window.addEventListener('resize', () => this.updateScale());
        setTimeout(() => this.updateScale(), 100);

        // Start preview auto-update every 3 seconds
        this.startPreviewInterval();

        // User scroll detection for output code display
        if (this.codeDisplay) {
            this.codeDisplay.addEventListener('scroll', () => {
                this.handleUserScroll();
            });
        }

        // Initialize resizer for panels
        this.initResizer();

        // Initialize panel toggle
        this.initPanelToggle();

        // Initialize keyboard shortcuts
        this.initKeyboardShortcuts();
    }

    // Initialize keyboard shortcuts
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Check for Ctrl/Cmd key
            const isCtrl = e.ctrlKey || e.metaKey;

            // Ctrl/Cmd + Enter - Play/Start typing
            if (isCtrl && e.key === 'Enter') {
                e.preventDefault();
                console.log('Shortcut: Ctrl+Enter - Play');
                this.handlePlayClick();
            }

            // Ctrl/Cmd + Space - Toggle panel
            if (isCtrl && e.code === 'Space') {
                e.preventDefault();
                console.log('Shortcut: Ctrl+Space - Toggle panel');
                this.togglePanel();
            }

            // Escape - Stop/Pause
            if (e.key === 'Escape') {
                console.log('Shortcut: Escape - Stop');
                if (this.isTyping) {
                    this.stopForEditing();
                }
            }

            // Ctrl/Cmd + S - Save code
            if (isCtrl && e.key === 's') {
                e.preventDefault();
                console.log('Shortcut: Ctrl+S - Save code');
                this.saveCode();
            }

            // Ctrl/Cmd + O - Open/Load saved code
            if (isCtrl && e.key === 'o') {
                e.preventDefault();
                console.log('Shortcut: Ctrl+O - Load code');
                this.loadCode();
            }

            // Ctrl/Cmd + / - Toggle comment (if in textarea)
            if (isCtrl && e.key === '/') {
                if (document.activeElement === this.inputCode) {
                    e.preventDefault();
                    console.log('Shortcut: Ctrl+/ - Toggle comment');
                    this.toggleComment();
                }
            }
        });
    }

    // Save code to localStorage
    saveCode() {
        const code = this.inputCode.value;
        if (!code.trim()) {
            alert('No code to save!');
            return;
        }
        localStorage.setItem('liveCoding_savedCode', code);
        localStorage.setItem('liveCoding_savedTime', new Date().toLocaleString());
        localStorage.setItem('liveCoding_savedTitle', this.parsedData.title || 'Untitled');

        // Show save location info
        const saveInfo = `✓ Code saved successfully!\n\nTitle: ${this.parsedData.title || 'Untitled'}\nLocation: Browser LocalStorage\nTime: ${new Date().toLocaleString()}\n\nNote: This is saved in your browser's memory and will persist across sessions.`;
        alert(saveInfo);
        console.log('Code saved to localStorage:', this.parsedData.title || 'Untitled');
        console.log('To view saved data, open DevTools (F12) → Application → LocalStorage');
    }

    // Load code from localStorage
    loadCode() {
        const savedCode = localStorage.getItem('liveCoding_savedCode');
        if (savedCode) {
            this.inputCode.value = savedCode;
            this.updateInputLineNumbers();
            this.highlightInput();
            this.parseInputCode();
            const savedTime = localStorage.getItem('liveCoding_savedTime');
            alert(`Code loaded! (Saved: ${savedTime})`);
            console.log('Code loaded from localStorage');
        } else {
            alert('No saved code found!');
        }
    }

    // Toggle comment for selected lines
    toggleComment() {
        const textarea = this.inputCode;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        // Find line start and end
        let lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = value.length;

        const selectedText = value.substring(lineStart, lineEnd);
        const lines = selectedText.split('\n');

        // Check if all lines are commented
        const allCommented = lines.every(line => line.trim().startsWith('<!--') && line.trim().endsWith('-->'));

        let newText;
        if (allCommented) {
            // Uncomment
            newText = lines.map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
                    return line.replace('<!--', '').replace('-->', '');
                }
                return line;
            }).join('\n');
        } else {
            // Comment
            newText = lines.map(line => '<!--' + line + '-->').join('\n');
        }

        textarea.value = value.substring(0, lineStart) + newText + value.substring(lineEnd);
        this.updateInputLineNumbers();
        this.highlightInput();
        this.parseInputCode();
    }

    // Initialize panel collapse/expand toggle
    initPanelToggle() {
        this.panelToggle = document.getElementById('panel-toggle');
        this.leftPanel = document.querySelector('.left-panel');
        this.container = document.querySelector('.container');

        if (!this.panelToggle || !this.leftPanel) {
            console.log('Panel toggle elements not found');
            return;
        }

        console.log('Panel toggle initialized');

        // Click handler for toggle button
        this.panelToggle.addEventListener('click', (e) => {
            console.log('Toggle button clicked!');
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            this.togglePanel();
        });

        // Mousedown handler to prevent resize starting
        this.panelToggle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
    }

    // Toggle panel collapse/expand
    togglePanel() {
        if (!this.leftPanel || !this.panelToggle) return;

        const isCollapsed = this.leftPanel.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand panel
            this.leftPanel.classList.remove('collapsed');
            if (this.container) {
                this.container.classList.remove('has-collapsed-panel');
            }
            document.body.classList.remove('panel-collapsed');
            this.panelToggle.title = 'Hide Editor';
            this.panelToggle.querySelector('.toggle-icon').textContent = '◄';
            this.leftPanel.style.width = '300px';
            this.panelToggle.style.left = '300px';
            console.log('Panel expanded');
        } else {
            // Collapse panel
            this.leftPanel.classList.add('collapsed');
            if (this.container) {
                this.container.classList.add('has-collapsed-panel');
            }
            document.body.classList.add('panel-collapsed');
            this.panelToggle.title = 'Show Editor';
            this.panelToggle.querySelector('.toggle-icon').textContent = '►';
            console.log('Panel collapsed');
        }

        setTimeout(() => this.updateScale(), 350);
    }

    // Initialize resizer for left/right panels
    initResizer() {
        this.resizer = document.getElementById('resizer');
        this.leftPanel = document.querySelector('.left-panel');
        this.container = document.querySelector('.container');

        if (!this.resizer || !this.leftPanel || !this.container) {
            console.log('Resizer elements not found');
            return;
        }

        console.log('Resizer initialized');

        let isResizing = false;
        let targetWidth = 300;
        let animationId = null;

        // Smooth follow animation
        const animateWidth = () => {
            if (!isResizing) {
                animationId = null;
                return;
            }

            const currentWidth = parseFloat(this.leftPanel.style.width) || 300;
            const diff = targetWidth - currentWidth;

            // Smooth easing - follow with delay
            const speed = 0.2;
            const newWidth = currentWidth + diff * speed;

            // Update width directly
            this.leftPanel.style.width = newWidth + 'px';

            // Continue animation if still resizing
            if (isResizing) {
                animationId = requestAnimationFrame(animateWidth);
            } else {
                animationId = null;
            }
        };

        this.resizer.addEventListener('mousedown', (e) => {
            console.log('Resizer mousedown event fired');
            if (this.leftPanel.classList.contains('collapsed')) {
                console.log('Panel is collapsed, not resizing');
                return;
            }

            isResizing = true;
            this.resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            console.log('Resizing started');
        });

        // Also add touch events for mobile
        this.resizer.addEventListener('touchstart', (e) => {
            console.log('Resizer touchstart event fired');
            if (this.leftPanel.classList.contains('collapsed')) return;

            isResizing = true;
            this.resizer.classList.add('resizing');
            document.body.style.userSelect = 'none';
        }, { passive: false });

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const containerRect = this.container.getBoundingClientRect();
            let newLeftWidth = e.clientX - containerRect.left;

            // Limits: min = default (300px), max = 90%
            const minWidth = 300;
            const maxWidth = containerRect.width * 0.9;

            // Clamp to limits
            targetWidth = Math.max(minWidth, Math.min(newLeftWidth, maxWidth));

            // Update toggle button position immediately
            if (this.panelToggle && !this.leftPanel.classList.contains('collapsed')) {
                this.panelToggle.style.left = targetWidth + 'px';
            }

            // Start animation if not running
            if (!animationId) {
                animationId = requestAnimationFrame(animateWidth);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);

        // Touch events for mobile
        const handleTouchMove = (e) => {
            if (!isResizing) return;
            e.preventDefault();

            const touch = e.touches[0];
            const containerRect = this.container.getBoundingClientRect();
            let newLeftWidth = touch.clientX - containerRect.left;

            const minWidth = 300;
            const maxWidth = containerRect.width * 0.9;
            targetWidth = Math.max(minWidth, Math.min(newLeftWidth, maxWidth));

            // Update toggle button position immediately
            if (this.panelToggle && !this.leftPanel.classList.contains('collapsed')) {
                this.panelToggle.style.left = targetWidth + 'px';
            }

            if (!animationId) {
                animationId = requestAnimationFrame(animateWidth);
            }
        };

        document.addEventListener('touchmove', handleTouchMove, { passive: false });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                this.resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                console.log('Resizing ended');
            }
        });
    }

    // Handle user scroll - check if user is at bottom or not
    handleUserScroll() {
        if (!this.codeDisplay) return;

        const scrollTop = this.codeDisplay.scrollTop;
        const scrollHeight = this.codeDisplay.scrollHeight;
        const clientHeight = this.codeDisplay.clientHeight;

        // Check if user is at bottom (within 50px of bottom)
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

        if (isAtBottom) {
            // User scrolled to bottom - re-enable auto-scroll
            this.userScrolled = false;
        } else {
            // User scrolled away from bottom - disable auto-scroll
            this.userScrolled = true;
        }
    }

    // Calculate typing speed based on slider value (0-100)
    // 0% = 100ms (10 chars/sec), 100% = 4ms (250 chars/sec)
    calculateTypingSpeed(val) {
        // 100ms dan 4ms gacha lineyn pasayish
        return 100 - (val * 0.96);
    }

    // Calculate chars per second from ms delay
    calculateCharsPerSecond(ms) {
        if (ms <= 0) return 0;
        return Math.round(1000 / ms);
    }

    // Update speed display labels
    updateSpeedDisplay(val) {
        const speedLabel = document.getElementById('speed-label');
        const msLabel = document.getElementById('speed-ms');
        const ms = this.calculateTypingSpeed(val);
        const charsPerSec = this.calculateCharsPerSecond(ms);

        if (speedLabel) speedLabel.textContent = val + '%';
        if (msLabel) {
            msLabel.textContent = charsPerSec + ' char/sec';
            msLabel.style.color = '#71f487';
        }
    }

    // Parse input code and extract title, style, body
    parseInputCode() {
        const html = this.inputCode.value.trim();
        if (!html) {
            this.parsedData = { title: '', style: '', body: '', hasErrors: false, errors: [] };
            return;
        }

        // Validate HTML structure
        const errors = this.validateHTML(html);

        // Extract title content
        let title = '';
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        // Extract style content (between <style> and </style>)
        let style = '';
        const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let styleMatch;
        while ((styleMatch = styleRegex.exec(html)) !== null) {
            style += styleMatch[1].trim();
            if (!styleMatch[1].trim().endsWith('\n')) style += '\n';
        }

        // Extract body content (between <body> and </body>)
        let body = '';
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
            body = bodyMatch[1].trim();
        }

        this.parsedData = {
            title: title || 'Document',
            style: style,
            body: body,
            hasErrors: errors.length > 0,
            errors: errors
        };

        // Show validation errors
        this.showErrors(errors);

        return this.parsedData;
    }

    // Start auto-update preview every 3 seconds
    startPreviewInterval() {
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
        }
        this.previewInterval = setInterval(() => {
            if (!this.isTyping && this.parsedData) {
                this.updatePreviewFromParsed();
            }
        }, 3000);
    }

    // Update preview from parsed data
    updatePreviewFromParsed() {
        if (!this.parsedData || (!this.parsedData.body && !this.parsedData.style)) return;

        const html = this.buildHTML(this.parsedData);
        try {
            this.preview.srcdoc = html;
        } catch (e) {}
    }

    // Build complete HTML from parsed parts
    buildHTML(data) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
${data.style}
    </style>
</head>
<body>
${data.body}
</body>
</html>`;
    }

    updateInputLineNumbers() {
        const lines = this.inputCode.value.split('\n').length;
        this.inputLineNumbers.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
    }

    highlightInput() {
        if (this.inputHighlight) {
            const code = this.inputHighlight.querySelector('code');
            code.textContent = this.inputCode.value;
            if (window.Prism) {
                Prism.highlightElement(code);
            }
        }
    }

    syncInputScroll() {
        // Smooth scroll for input line numbers and highlight
        const scrollTop = this.inputCode.scrollTop;
        const scrollLeft = this.inputCode.scrollLeft;

        this.inputLineNumbers.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
        });

        if (this.inputHighlight) {
            this.inputHighlight.scrollTo({
                top: scrollTop,
                left: scrollLeft,
                behavior: 'smooth'
            });
        }
    }

    updateOutputLineNumbers() {
        const lines = this.typedContent.split('\n').length;
        this.outputLineNumbers.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
    }

    validateHTML(html) {
        const errors = [];

        // Only show warnings, don't block execution
        // Check for basic structure (warnings only)
        if (!html.includes('<!DOCTYPE')) {
            errors.push('WARNING: Missing <!DOCTYPE html>');
        }
        if (!html.includes('<html')) {
            errors.push('WARNING: Missing <html> tag');
        }
        if (!html.includes('</html>')) {
            errors.push('WARNING: Missing </html> closing tag');
        }
        if (!html.includes('<head>')) {
            errors.push('WARNING: Missing <head> tag');
        }
        if (!html.includes('</head>')) {
            errors.push('WARNING: Missing </head> closing tag');
        }
        if (!html.includes('<body>')) {
            errors.push('WARNING: Missing <body> tag');
        }
        if (!html.includes('</body>')) {
            errors.push('WARNING: Missing </body> closing tag');
        }
        if (!html.includes('<title>')) {
            errors.push('WARNING: Missing <title> tag');
        }
        if (!html.includes('</title>')) {
            errors.push('WARNING: Missing </title> closing tag');
        }

        // Check for style tag issues
        if (html.includes('<style>') && !html.includes('</style>')) {
            errors.push('ERROR: Missing </style> closing tag');
        }

        return errors;
    }

    showErrors(errors) {
        // Separate actual errors from warnings
        const actualErrors = errors.filter(e => e.includes('ERROR:'));
        const warnings = errors.filter(e => e.includes('WARNING:'));

        if (actualErrors.length > 0) {
            this.errorDisplay.innerHTML = '<strong>ERRORS FOUND:</strong><br>' + actualErrors.map(e => '&#8226; ' + e).join('<br>');
            this.errorDisplay.classList.remove('hidden');
            this.errorDisplay.style.background = '#3d1f1f';
            this.errorDisplay.style.color = '#f48771';
        } else if (warnings.length > 0) {
            this.errorDisplay.innerHTML = '<strong>⚠ WARNINGS:</strong><br>' + warnings.map(e => '&#8226; ' + e.replace('WARNING: ', '')).join('<br>');
            this.errorDisplay.classList.remove('hidden');
            this.errorDisplay.style.background = '#3d3d1f';
            this.errorDisplay.style.color = '#f4e771';
        } else if (this.inputCode.value.trim()) {
            this.errorDisplay.innerHTML = '<strong>✓ VALID HTML</strong> - Ready to generate';
            this.errorDisplay.classList.remove('hidden');
            this.errorDisplay.style.background = '#1f3d1f';
            this.errorDisplay.style.color = '#71f487';
        } else {
            this.errorDisplay.classList.add('hidden');
        }

        // Return true only if there are actual blocking errors
        return actualErrors.length > 0;
    }

    initPreviewDrag() {
        if (!this.previewContainer) return;

        let isDragging = false;
        let startX, startY;
        let scrollLeft, scrollTop;

        this.previewContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.previewContainer.style.cursor = 'grabbing';
            startX = e.pageX - this.previewContainer.offsetLeft;
            startY = e.pageY - this.previewContainer.offsetTop;
            scrollLeft = this.previewContainer.scrollLeft;
            scrollTop = this.previewContainer.scrollTop;
        });

        this.previewContainer.addEventListener('mouseleave', () => {
            isDragging = false;
            this.previewContainer.style.cursor = 'grab';
        });

        this.previewContainer.addEventListener('mouseup', () => {
            isDragging = false;
            this.previewContainer.style.cursor = 'grab';
        });

        this.previewContainer.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - this.previewContainer.offsetLeft;
            const y = e.pageY - this.previewContainer.offsetTop;
            const walkX = (x - startX) * 1.5;
            const walkY = (y - startY) * 1.5;
            this.previewContainer.scrollLeft = scrollLeft - walkX;
            this.previewContainer.scrollTop = scrollTop - walkY;
        });

        this.previewContainer.style.cursor = 'grab';
    }

    updatePreviewScale(value) {
        if (!this.preview) return;
        const zoomLevel = 1 + (value / 100) * 2;
        this.preview.style.transform = `scale(${zoomLevel})`;
    }

    updateScale() {
        if (!this.previewContainer || !this.preview) return;
        const containerWidth = this.previewContainer.clientWidth;
        const containerHeight = this.previewContainer.clientHeight;
        const scaleX = containerWidth / 1920;
        const scaleY = containerHeight / 1080;
        const scale = Math.min(scaleX, scaleY);
        this.preview.style.transform = `scale(${scale})`;
    }

    analyzeCode(html) {
        // Use the parsed data we already have
        if (!this.parsedData || !this.parsedData.title) {
            this.parseInputCode();
        }

        const diagnostics = {
            valid: !this.parsedData.hasErrors,
            title: this.parsedData.title || 'Document',
            body: this.parsedData.body || '',
            style: this.parsedData.style || '',
            totalChars: 0
        };

        diagnostics.totalChars = this.calculateOutputLength(diagnostics);

        return diagnostics;
    }

    calculateOutputLength(data) {
        let length = 0;
        if (data.title) length += data.title.replace(/\s/g, '').length;
        if (data.body) length += data.body.replace(/\s/g, '').length;
        if (data.style) length += data.style.replace(/\s/g, '').length;
        length += 150;
        return length;
    }

    formatProgress(current, total) {
        const formatNum = (num) => {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'm';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
            return num.toString();
        };

        const currentFormatted = formatNum(current);
        const totalFormatted = formatNum(total);
        const percent = total > 0 ? ((current / total) * 100).toFixed(1) : 0;

        return `${currentFormatted}/${totalFormatted} chars (${percent}%)`;
    }

    handlePlayClick() {
        console.log('Play button clicked, isPaused:', this.isPaused, 'isTyping:', this.isTyping);
        if (this.isPaused) {
            // STOP - Stop completely, allow editing
            this.stopForEditing();
        } else if (this.isTyping) {
            // Already playing, do nothing
            return;
        } else {
            // Check if parsed data has errors
            this.parseInputCode();
            console.log('After parseInputCode, hasErrors:', this.parsedData.hasErrors);
            // Check for actual blocking errors (not just warnings)
            const hasBlockingErrors = this.parsedData.errors.some(e => e.includes('ERROR:'));
            if (hasBlockingErrors) {
                // Show errors but don't start
                console.log('Blocking errors found, not starting');
                return;
            }
            // Start new typing
            this.startTyping();
        }
    }

    stopForEditing() {
        // Stop typing completely, user can now edit the input
        this.isPaused = false;
        this.isTyping = false;
        this.typedContent = '';
        this.typedCode.innerHTML = '';
        this.preview.srcdoc = '';
        this.currentChars = 0;
        this.totalChars = 0;
        this.progressValue.textContent = '0/0 chars (0.0%)';
        // Input is NOT cleared - user can edit it
        // Input highlighting is updated
        this.updateInputLineNumbers();
        this.highlightInput();
        // Restart preview interval
        this.startPreviewInterval();
        // Focus the textarea so user can immediately start editing
        this.inputCode.focus();
    }

    resetOutputOnly() {
        this.isTyping = false;
        this.isPaused = false;
        this.userScrolled = false;
        this.typedContent = '';
        this.typedCode.innerHTML = '';
        this.preview.srcdoc = '';
        this.currentChars = 0;
        this.totalChars = 0;
        this.progressValue.textContent = '0/0 chars (0.0%)';
        this.errorDisplay.classList.add('hidden');
        // Smooth scroll to top for code display
        if (this.codeDisplay) {
            this.codeDisplay.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
        // Restart preview interval
        this.startPreviewInterval();
    }

    handlePauseClick() {
        if (!this.isTyping) {
            // If not typing, PAUSE button clears the preview
            this.resetOutputOnly();
            return;
        }

        if (this.isPaused) {
            // Resume typing
            this.isPaused = false;
        } else {
            // Pause - allow editing
            this.isPaused = true;
        }
    }

    resumeTyping() {
        // Resume will be handled by the typing loop checking isPaused
    }

    async startTyping() {
        console.log('startTyping called');

        if (this.isTyping) {
            console.log('Already typing, resetting...');
            this.reset();
            await this.sleep(100);
        }

        const input = this.inputCode.value.trim();
        console.log('Input length:', input.length);

        if (!input) {
            this.showErrors(['Please enter HTML code first']);
            return;
        }

        // Parse and validate the code
        this.parseInputCode();
        console.log('Parsed data:', this.parsedData);

        // Check for actual blocking errors
        const hasBlockingErrors = this.parsedData.errors.some(e => e.includes('ERROR:'));
        if (hasBlockingErrors) {
            console.log('Has blocking errors, not starting');
            // Don't start if there are blocking errors
            return;
        }

        const diagnostics = this.analyzeCode(input);
        console.log('Diagnostics:', diagnostics);

        this.isTyping = true;
        this.isPaused = false;
        this.resetScrollDetection(); // Reset scroll detection
        this.typedContent = '';
        this.typedCode.innerHTML = '';

        // Stop auto-preview while typing
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
        }

        this.totalChars = diagnostics.totalChars || 100;
        this.currentChars = 0;
        this.progressValue.textContent = this.formatProgress(0, this.totalChars);

        if (this.codeDisplay) {
            this.codeDisplay.scrollTop = 0;
        }

        console.log('Starting realTyping...');
        await this.realTyping(diagnostics);
        console.log('realTyping finished');

        this.isTyping = false;
        this.isPaused = false;

        // Restart auto-preview after typing
        this.startPreviewInterval();
    }

    async realTyping(data) {
        console.log('realTyping started with data:', data);
        const title = data.title || 'Document';
        const bodyContent = data.body || '';
        const styleContent = data.style || '';

        // Build the complete HTML structure with actual title
        const htmlStructure = this.buildHTML({
            title: title,
            style: '',
            body: ''
        });
        console.log('HTML structure built, lines:', htmlStructure.split('\n').length);

        // Type the structure line by line naturally
        const lines = htmlStructure.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log(`Typing line ${i + 1}/${lines.length}:`, line.substring(0, 50));
            await this.typeLineWithCursor(line);
        }

        console.log('Structure typing complete');

        // FIRST: Type body content if exists
        if (bodyContent) {
            console.log('Typing body content...');
            await this.scrollToTag('body');
            await this.sleep(300);
            await this.typeIntoTag('body', bodyContent);
        }

        // SECOND: Type style content if exists
        if (styleContent) {
            console.log('Typing style content...');
            await this.scrollToTag('style');
            await this.sleep(300);
            await this.typeIntoTag('style', styleContent);
        }

        await this.sleep(200);
        this.updateTypedCodeDisplay();
        this.updatePreview();

    }

    // Type a line with natural cursor movement
    async typeLineWithCursor(text) {
        console.log('typeLineWithCursor called, text length:', text.length, 'isTyping:', this.isTyping);

        for (const char of text) {
            // Wait if paused
            while (this.isPaused) {
                await this.sleep(100);
            }
            // Check if reset was called while paused
            if (!this.isTyping) {
                console.log('isTyping is false, stopping');
                return;
            }

            this.typedContent += char;
            this.updateTypedCodeDisplay();
            if (!/\s/.test(char)) {
                this.currentChars++;
            }
            this.updateProgressBar();
            this.autoScroll();

            // Update preview on EVERY character (live preview)
            this.updatePreview();

            // Normal mode with delay (4ms minimum)
            const variation = Math.random() * 20 - 10;
            await this.sleep(Math.max(4, this.typingSpeed + variation));
        }
        this.typedContent += '\n';
        this.updateTypedCodeDisplay();
        this.updateOutputLineNumbers();
        this.autoScroll();
        this.updatePreview();
        console.log('Line complete, typedContent length:', this.typedContent.length);
    }

    async typeLine(text) {
        // Delegate to typeLineWithCursor for consistency
        await this.typeLineWithCursor(text);
    }

    updateTypedCodeDisplay() {
        if (!this.typedCode) {
            console.log('typedCode element not found!');
            return;
        }
        if (window.Prism && Prism.languages && Prism.languages.html) {
            // Use Prism.highlight to generate highlighted HTML
            const highlighted = Prism.highlight(this.typedContent, Prism.languages.html, 'html');
            this.typedCode.innerHTML = highlighted;
        } else {
            this.typedCode.textContent = this.typedContent;
        }
    }

    async typeIntoTag(tagName, content) {
        const openTag = `<${tagName}>`;
        const closeTag = `</${tagName}>`;

        if (!content.trim()) return;

        // Prepare content with proper indentation
        let formattedContent = '';
        const lines = content.split('\n').filter(line => line.trim());

        if (tagName === 'style') {
            for (const line of lines) {
                formattedContent += '\n        ' + line.trim();
            }
        } else if (tagName === 'body') {
            for (const line of lines) {
                formattedContent += '\n    ' + line;
            }
        }

        // Type content line by line
        const contentLines = formattedContent.split('\n');
        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            if (!line && i === 0) continue; // Skip empty first line

            for (const char of line) {
                while (this.isPaused) await this.sleep(100);
                if (!this.isTyping) return;

                // Find the closing tag position (it moves as we insert)
                let currentCloseIndex = this.typedContent.indexOf(closeTag);
                if (currentCloseIndex === -1) return;

                // Insert character before closing tag
                this.typedContent = this.typedContent.substring(0, currentCloseIndex) +
                                  char +
                                  this.typedContent.substring(currentCloseIndex);

                this.updateTypedCodeDisplay();
                if (!/\s/.test(char)) {
                    this.currentChars++;
                }
                this.updateProgressBar();
                this.autoScroll();

                // Update preview on EVERY character (live preview)
                this.updatePreview();

                // Natural typing variation (4ms minimum)
                const variation = Math.random() * 15 - 7;
                await this.sleep(Math.max(4, this.typingSpeed + variation));
            }

            // Add newline after each line except the last
            if (i < contentLines.length - 1) {
                let currentCloseIndex = this.typedContent.indexOf(closeTag);
                if (currentCloseIndex !== -1) {
                    this.typedContent = this.typedContent.substring(0, currentCloseIndex) +
                                      '\n' +
                                      this.typedContent.substring(currentCloseIndex);
                }
            }

            this.updateTypedCodeDisplay();
            this.updateOutputLineNumbers();
            this.autoScroll();
        }

        this.updatePreview();
    }

    updateCodeDisplay() {
        this.updateTypedCodeDisplay();
    }

    highlightOutputCode() {
        if (window.Prism && this.typedCode) {
            // Remove existing Prism classes to force re-highlight
            this.typedCode.className = 'language-html';
            Prism.highlightElement(this.typedCode);
        }
    }

    async scrollToTag(tagName) {
        if (!this.codeDisplay) return;
        const openTag = `<${tagName}>`;
        const index = this.typedContent.indexOf(openTag);
        if (index === -1) return;
        const lines = this.typedContent.substring(0, index).split('\n');
        const lineHeight = 20.8;
        const targetScroll = (lines.length - 1) * lineHeight;
        this.codeDisplay.scrollTo({
            top: Math.max(0, targetScroll - 50),
            behavior: 'smooth'
        });
        await this.sleep(300);
    }

    autoScroll() {
        if (this.codeDisplay && !this.userScrolled) {
            this.codeDisplay.scrollTo({
                top: this.codeDisplay.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    updateProgressBar() {
        if (this.totalChars === 0) return;
        this.progressValue.textContent = this.formatProgress(this.currentChars, this.totalChars);
    }

    updatePreview() {
        if (this.isTyping && this.typedContent) {
            // Update during typing
            try {
                this.preview.srcdoc = this.typedContent;
            } catch (e) {}
        } else if (!this.isTyping && this.parsedData) {
            // Use parsed data when not typing
            this.updatePreviewFromParsed();
        }
    }

    reset() {
        this.isTyping = false;
        this.isPaused = false;
        this.userScrolled = false;
        this.typedContent = '';
        this.typedCode.innerHTML = '';
        this.preview.srcdoc = '';
        this.inputCode.value = '';
        this.parsedData = { title: '', style: '', body: '', hasErrors: false, errors: [] };
        this.updateInputLineNumbers();
        this.outputLineNumbers.textContent = '1';
        this.currentChars = 0;
        this.totalChars = 0;
        this.progressValue.textContent = '0/0 chars (0.0%)';
        this.errorDisplay.classList.add('hidden');
        // Smooth scroll to top for code display
        if (this.codeDisplay) {
            this.codeDisplay.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
        // Restart preview interval
        this.startPreviewInterval();
    }

    // Reset scroll detection when starting new typing
    resetScrollDetection() {
        this.userScrolled = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

document.addEventListener('DOMContentLoaded', () => new LiveCodingApp());
