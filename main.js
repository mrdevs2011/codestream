// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, get, child } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD3WNuR8LcsjgHo_No1zuIxPbiT9X6Mvd0",
    authDomain: "codestream-b01d8.firebaseapp.com",
    databaseURL: "https://codestream-b01d8-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "codestream-b01d8",
    storageBucket: "codestream-b01d8.firebasestorage.app",
    messagingSenderId: "175692262236",
    appId: "1:175692262236:web:854dad4ac2dbb10d01ef99",
    measurementId: "G-88S0KER1J6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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
        // Preview update
        this.previewInterval = null;
        this.previewUpdating = false; // Crossfade animatsiya flag
        this.lastPreviewContent = ''; // Oxirgi ko'rsatilgan content
        this.wasTypingBeforeBlur = false; // Tab switch uchun
        this.closingTags = []; // tags.json dan yuklanadi
        this.isSaving = false; // Faqat 1 marta saqlash uchun
        this.savedRoomId = null; // Saqlangan room ID
        this.stopRequested = false; // Async loop stop signal
        // Smooth resize animation
        this.resizeAnimationId = null;
        this.targetWidth = 300;
        // Current saved ID for sharing
        this.currentShareId = null;
        // Auto-refresh flag
        this.autoRefreshEnabled = false;
        // Smart auto-scroll
        this.scrollTimeout = null;
        this.init();
    }

    // Splash Screen initialization
    initSplashScreen() {
        const splash = document.getElementById('splash-screen');
        const mainContainer = document.getElementById('main-container');

        if (!splash) return;

        // 🧊 FREEZE: Add splash-active class to body to freeze background
        document.body.classList.add('splash-active');
        console.log('🧊 Splash screen: Background frozen');

        // Hide splash screen after animation completes
        setTimeout(() => {
            // ❄️ UNFREEZE: Remove splash-active class before showing main content
            document.body.classList.remove('splash-active');
            console.log('❄️ Splash screen: Background unfrozen');

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

    // Load closing tags from tags.json
    async loadClosingTags() {
        try {
            const response = await fetch('tags.json');
            const data = await response.json();
            this.closingTags = data.htmlTags || [];
            this.cssTriggers = data.cssTriggers || ['{'];
            console.log('✅ Loaded', this.closingTags.length, 'closing tags');
        } catch (e) {
            console.error('Failed to load tags.json:', e);
            this.closingTags = [];
            this.cssTriggers = ['{'];
        }
    }

    // Check if content ends with a closing tag from tags.json
    endsWithClosingTag(content) {
        if (!this.closingTags || this.closingTags.length === 0) return false;

        // Oxiridagi 30 ta belgini olish
        const lastChars = content.slice(-30);

        for (const tag of this.closingTags) {
            // Tag content oxirida bormi?
            const tagIndex = lastChars.lastIndexOf(tag);
            if (tagIndex !== -1) {
                // Tag dan keyin nima bor?
                const afterTag = lastChars.substring(tagIndex + tag.length);
                // Agar faqat bo'sh joy, yangi qatar yoki hech narsa bo'lmasa
                if (/^[\s\n]*$/.test(afterTag)) {
                    return true;
                }
            }
        }
        return false;
    }

    // Check if content ends with CSS trigger
    endsWithCssTrigger(content) {
        if (!this.cssTriggers || this.cssTriggers.length === 0) return false;
        return this.cssTriggers.some(trigger => content.endsWith(trigger));
    }

    // Generate unique room ID: a3a4eqfasr3qrqw34u398ruasdfuhor732q8y3287q49
    generateUniqueId(length = 50) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Get unique room ID and check if exists in Firebase
    async getUniqueRoomId() {
        try {
            console.log('Generating unique room ID...');
            let roomId;
            let attempts = 0;
            const maxAttempts = 10;

            do {
                roomId = this.generateUniqueId(50); // 50 ta belgi
                attempts++;

                // Check if this ID already exists
                const dbRef = ref(database);
                const snapshot = await get(child(dbRef, `codes/${roomId}`));

                if (!snapshot.exists()) {
                    // ID is unique, use it
                    console.log('✅ Generated unique room ID:', roomId.substring(0, 20) + '...');
                    return roomId;
                }

                console.log(`⚠️ ID collision, retrying... (${attempts}/${maxAttempts})`);
            } while (attempts < maxAttempts);

            // Fallback if all attempts failed
            const fallbackId = this.generateUniqueId(50) + Date.now();
            console.log('Using fallback ID');
            return fallbackId;
        } catch (error) {
            console.error('❌ Error generating room ID:', error);
            // Fallback to timestamp + random
            const fallbackId = Date.now().toString(36) + Math.random().toString(36).substring(2);
            console.log('Using fallback ID:', fallbackId);
            return fallbackId;
        }
    }

    // Show notification toast
    showToast(message, type = 'success') {
        // Remove existing toast
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
            <span class="toast-message">${message}</span>
        `;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (e) {
                return false;
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }

    // Check URL for room ID in hash (#roomId)
    async checkUrlForSharedCode() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            const roomId = hash.substring(1); // Remove # symbol
            // Any non-empty room ID is valid
            if (roomId.length > 0) {
                console.log('Loading Room:', roomId);
                await this.loadFromFirebase(roomId);
            }
        }
    }

    // Load code from Firebase by ID
    async loadFromFirebase(codeId) {
        try {
            const dbRef = ref(database);
            const snapshot = await get(child(dbRef, `codes/${codeId}`));

            if (snapshot.exists()) {
                const data = snapshot.val();

                // 🛡️ NULL CHECK: data obyektini tekshirish
                if (!data || typeof data !== 'object') {
                    console.error('Invalid data received from Firebase');
                    this.showToast('Invalid data received', 'error');
                    return;
                }

                // 🔄 NO WHITEFLASH: Faqat typedContent ni reset qilish
                console.log('🔄 Resetting output before loading new code...');
                this.typedContent = '';
                if (this.typedCode) this.typedCode.innerHTML = '';
                if (this.outputLineNumbers) this.outputLineNumbers.textContent = '1';
                this.currentChars = 0;
                this.totalChars = 0;

                // 🛡️ NULL CHECK: data.code tekshirish
                this.inputCode.value = (data && data.code) ? data.code : '';
                this.currentShareId = codeId;

                // ⚠️ NO localStorage - fresh load every time

                this.updateInputLineNumbers();
                this.highlightInput();
                this.parseInputCode();

                const shortCodeId = codeId.substring(0, 10) + '...';
                // 🛡️ NULL CHECK: data.title tekshirish
                const title = (data && data.title) ? data.title : 'Untitled';
                this.showToast(`Loaded Room #${shortCodeId} (${title})`, 'success');
                console.log('Code loaded from Room:', codeId.substring(0, 20) + '...');

                // 🎬 AUTO PLAY MODE: URL orqali kirgan foydalanuvchilar uchun
                console.log('🎬 Starting auto-play mode...');

                // Small delay to ensure UI is ready
                await this.sleep(200);
                this.startAutoPlay();
            } else {
                const shortCodeId = codeId.substring(0, 10) + '...';
                this.showToast(`Room #${shortCodeId} not found!`, 'error');
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            this.showToast('Failed to load code', 'error');
        }
    }

    // Auto-play mode for URL visitors (no user interaction needed)
    async startAutoPlay() {
        console.log('🚀 Auto-play: Starting with 1-second refresh cycle...');

        // 1. Default speed (NO localStorage)
        const speedValue = 70;
        this.typingSpeed = this.calculateTypingSpeed(speedValue);
        this.speedSlider.value = speedValue;
        this.updateSpeedDisplay(speedValue);

        // Wait for UI to update
        await this.sleep(100);

        // 2. Hide panel (like Ctrl+Space)
        console.log('🚀 Auto-play: Hiding panel...');
        if (this.leftPanel && !this.leftPanel.classList.contains('collapsed')) {
            this.togglePanel();
        }

        // Wait for animation
        await this.sleep(300);

        // 3. Start typing and auto-refresh cycle
        console.log('🚀 Auto-play: Starting cycle...');

        // 4. Enable auto-refresh and start cycle
        this.enableAutoRefresh();
        this.runTypingCycle();

        console.log('✅ Auto-play mode activated! Cycle-based refresh');
    }

    // Save code to Firebase with auto-increment room ID
    async saveToFirebase() {
        console.log('saveToFirebase started...');

        // 🛡️ NULL CHECK: inputCode mavjudligini tekshirish
        if (!this.inputCode || !this.inputCode.value) {
            this.showToast('No code to save!', 'error');
            return null;
        }

        const code = this.inputCode.value;
        if (!code.trim()) {
            this.showToast('No code to save!', 'error');
            return null;
        }

        try {
            // Generate unique room ID
            console.log('Getting unique room ID...');
            const roomId = await this.getUniqueRoomId();
            console.log('Got room ID:', roomId.substring(0, 20) + '...');

            // 🛡️ NULL CHECK: parsedData tekshirish
            const parsedData = this.parsedData || {};
            const title = parsedData.title || 'Untitled';

            const data = {
                code: code,
                title: title,
                timestamp: Date.now(),
                createdAt: new Date().toISOString(),
                roomId: roomId
            };

            console.log('Saving to Firebase path:', `codes/${roomId}`);
            await set(ref(database, `codes/${roomId}`), data);
            this.currentShareId = roomId;
            console.log('✅ Code saved to Firebase Room:', roomId);
            return roomId;
        } catch (error) {
            console.error('❌ Error saving to Firebase:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            this.showToast('Cloud save failed: ' + (error.message || 'Unknown error'), 'error');
            return null;
        }
    }

    async init() {
        // Initialize splash screen
        this.initSplashScreen();

        // Load closing tags from JSON (await to prevent race condition)
        await this.loadClosingTags();

        this.speedSlider = document.getElementById('speed');
        this.previewScaleSlider = document.getElementById('preview-scale');
        this.progressValue = document.getElementById('progress-value');
        this.inputCode = document.getElementById('input-code');
        this.inputHighlight = document.getElementById('input-highlight');
        this.typedCode = document.getElementById('typed-code');
        this.preview = document.getElementById('preview');
        this.previewContainer = document.getElementById('preview-wrapper');
        this.previewScaler = document.getElementById('preview-scaler');
        this.codeDisplayWrapper = document.getElementById('code-display-wrapper');
        this.codeDisplay = document.querySelector('.code-display');
        this.errorDisplay = document.getElementById('error-display');
        this.inputLineNumbers = document.getElementById('input-line-numbers');
        this.outputLineNumbers = document.getElementById('output-line-numbers');
        this.panelResizer = document.getElementById('panel-resizer');

        // Speed slider - linear from 200ms to 0.5ms
        // Update display and typing speed
        this.speedSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.typingSpeed = this.calculateTypingSpeed(val);
            this.updateSpeedDisplay(val);
            // ⚠️ NO localStorage - speed resets every time
        });

        // Initialize display - default speed
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

        // 🎯 FOCUS: User yozayotganda auto-refresh to'xtasin
        this.inputCode.addEventListener('focus', () => {
            console.log('📝 User typing - pausing auto-refresh');
            this.disableAutoRefresh();
        });

        // 🎯 BLUR: User yozib bo'lgach auto-refresh boshlansin
        this.inputCode.addEventListener('blur', () => {
            console.log('✏️ User finished typing - resuming auto-refresh');
            // Faqat editor da kod bo'lsa va typing yo'q bo'lsa va autoRefresh yo'q bo'lsa
            if (this.inputCode.value.trim() && !this.isTyping && !this.autoRefreshEnabled) {
                this.enableAutoRefresh();
                this.runTypingCycle();
            }
        });

        window.addEventListener('resize', () => this.updateScale());
        // 🎯 Default scale - container'ga moslash
        setTimeout(() => {
            console.log('🎯 Initializing preview scale...');
            this.updateScale();
            // Default scale = 1 (100%) - user slider bilan o'zgartirishi mumkin
            if (this.previewScaleSlider) {
                this.previewScaleSlider.value = 0;
                this.updatePreviewScale(0);
            }
            console.log('✅ Preview scale initialized');
        }, 300);

        // 🔄 LIVE PREVIEW: Har 2 sekundda preview yangilanadi
        this.startPreviewInterval();

        // User scroll detection for output code display
        if (this.codeDisplay) {
            this.codeDisplay.addEventListener('scroll', () => {
                this.handleUserScroll();
            });

            // Space to toggle auto-scroll when viewing preview code
            this.codeDisplay.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    this.userScrolled = !this.userScrolled;
                    if (!this.userScrolled) {
                        this.autoScroll();
                    }
                    console.log('[Scroll] Auto-scroll:', this.userScrolled ? 'PAUSED' : 'ACTIVE');
                }
            });

            // Make code display focusable
            this.codeDisplay.setAttribute('tabindex', '0');
        }

        // Initialize resizer for panels
        this.initResizer();

        // Initialize vertical panel resizer (code display vs preview)
        this.initPanelResizer();

        // Initialize panel toggle
        this.initPanelToggle();

        // Initialize keyboard shortcuts
        this.initKeyboardShortcuts();

        // 🌐 Tab visibility change - pause/resume
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseTyping();
            } else {
                this.resumeTyping();
            }
        });

        // 🌐 Window blur/focus - pause/resume
        window.addEventListener('blur', () => this.pauseTyping());
        window.addEventListener('focus', () => this.resumeTyping());

        // Check for auto-replay (URL only) - wait for splash screen to finish
        setTimeout(() => {
            this.checkForAutoReplay();
        }, 2500);
    }

    // Check for auto-replay: URL room only (NO localStorage)
    async checkForAutoReplay() {
        const hash = window.location.hash;

        // 1. Check URL hash first (any room ID format)
        if (hash && hash.length > 1) {
            const roomId = hash.substring(1);
            if (roomId.length >= 10) { // Minimum length for unique ID
                console.log('🎬 Auto-replay from URL Room:', roomId.substring(0, 20) + '...');
                await this.loadFromFirebase(roomId);
                return;
            }
        }

        // 2. ⚠️ NO localStorage - skip localStorage replay
        const currentInput = this.inputCode.value.trim();

        // ⚠️ NO auto-refresh on init - user input yozib bo'lgachgina
        console.log('⏳ Waiting for user input...');
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

            // Alt + S - Save code
            if ((e.altKey) && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔥 Shortcut: Alt+S - Save code');
                this.saveCode();
                return;
            }

            // Alt + C - Copy share link (faqat Alt+C ishlaydi, Ctrl+C default copy)
            if ((e.altKey) && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
                // Faqat hech qanday text tanlanmagan bo'lsa
                const selection = window.getSelection().toString();
                if (!selection && document.activeElement !== this.inputCode) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔥 Shortcut: Alt+C - Copy share link');
                    this.copyShareLink();
                    return;
                }
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

    // Save code to Firebase only - FAqat 1 marta saqlash mumkin
    async saveCode() {
        console.log('SaveCode started...');
        const code = this.inputCode.value;
        if (!code.trim()) {
            this.showToast('No code to save!', 'error');
            return;
        }

        // 🔄 Agar hozirda saqlanayotgan bo'lsa yoki allaqachon saqlangan bo'lsa
        if (this.isSaving) {
            console.log('⏳ Already saving, please wait...');
            this.showToast('⏳ Saving in progress...', 'info');
            return;
        }

        // 🔄 Agar bu project allaqachon saqlangan bo'lsa (hash bor)
        const hash = window.location.hash;
        if (hash && hash.length > 1 && this.currentShareId) {
            console.log('🔄 Project already saved:', this.currentShareId.substring(0, 10));
            this.showToast(`✅ Already saved! Press Alt+C to copy link`, 'info');
            return;
        }

        this.isSaving = true;

        // Parse code to get title
        this.parseInputCode();
        const title = this.parsedData?.title || 'Untitled';

        try {
            // Save to Firebase only
            console.log('Saving to Firebase...');
            const roomId = await this.saveToFirebase();

            // 🛡️ NULL CHECK: roomId tekshirish
            if (roomId && typeof roomId === 'string') {
                // Update URL with hash format
                window.location.hash = roomId;
                const shortRoomId = roomId.substring(0, 10) + '...';
                // 📝 Project nomi bilan ko'rsatish
                this.showToast(`✅ "${title}" saved to Room #${shortRoomId}`, 'success');
                console.log('✅ Code saved to Room:', roomId.substring(0, 20) + '...');
            } else {
                this.showToast('Save failed!', 'error');
                console.log('❌ Failed to save');
            }
        } catch (e) {
            console.error('Save error:', e);
            this.showToast('Save failed: ' + e.message, 'error');
        } finally {
            this.isSaving = false;
        }
    }

    // Copy share link to clipboard (Alt+C)
    async copyShareLink() {
        console.log('copyShareLink called, currentShareId:', this.currentShareId);

        // Check URL hash if no currentShareId
        if (!this.currentShareId) {
            const hash = window.location.hash;
            if (hash && hash.length > 1) {
                this.currentShareId = hash.substring(1);
                console.log('Got room ID from URL:', this.currentShareId);
            }
        }

        // 🛡️ NULL CHECK: currentShareId string ekanligini tekshirish
        if (!this.currentShareId || typeof this.currentShareId !== 'string') {
            this.showToast('❌ No room yet! Press Alt+S to save first', 'error');
            return;
        }

        const shareUrl = `${window.location.origin}${window.location.pathname}#${this.currentShareId}`;
        console.log('Share URL:', shareUrl);

        const copied = await this.copyToClipboard(shareUrl);

        if (copied) {
            const shortId = this.currentShareId.substring(0, 10) + '...';
            // 📋 Link ni notification da ko'rsatish
            this.showToast(`🔗 Copied: ${shareUrl}`, 'success');
        } else {
            this.showToast(`🔗 Copy failed: ${shareUrl}`, 'error');
        }

        console.log('✅ Room URL copied:', shareUrl);
    }

    // Toggle comment for selected lines
    toggleComment() {
        const textarea = this.inputCode;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        // 🛡️ NULL CHECK: value mavjudligini tekshirish
        if (!value || typeof value !== 'string') return;

        // Find line start and end
        let lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = value.length;

        const selectedText = value.substring(lineStart, lineEnd);
        const lines = selectedText.split('\n');

        // 🛡️ NULL CHECK: lines array tekshirish va startsWith xavfsiz chaqirish
        const allCommented = lines.every(line => {
            if (!line || typeof line !== 'string') return false;
            const trimmed = line.trim();
            return trimmed && trimmed.startsWith && trimmed.startsWith('<!--') && trimmed.endsWith('-->');
        });

        let newText;
        if (allCommented) {
            // Uncomment
            newText = lines.map(line => {
                if (!line || typeof line !== 'string') return line;
                const trimmed = line.trim();
                if (trimmed && trimmed.startsWith && trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
                    return line.replace('<!--', '').replace('-->', '');
                }
                return line;
            }).join('\n');
        } else {
            // Comment
            newText = lines.map(line => {
                if (!line || typeof line !== 'string') return line;
                return '<!--' + line + '-->';
            }).join('\n');
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

        // touchend for mobile
        document.addEventListener('touchend', () => {
            if (isResizing) {
                isResizing = false;
                this.resizer.classList.remove('resizing');
                document.body.style.userSelect = '';
                console.log('Resizing ended (touch)');
            }
        });
    }

    // Initialize vertical resizer between code display and preview
    initPanelResizer() {
        if (!this.panelResizer || !this.codeDisplayWrapper || !this.previewContainer) {
            console.log('Panel resizer elements not found');
            return;
        }

        console.log('Panel resizer initialized');

        let isResizing = false;
        let targetCodePercent = 40;
        let animationId = null;
        const rightPanel = this.codeDisplayWrapper.parentElement;

        // Smooth animation loop
        const animateResize = () => {
            if (!isResizing) {
                animationId = null;
                return;
            }

            const currentCodePercent = parseFloat(this.codeDisplayWrapper.style.height) || 40;
            const diff = targetCodePercent - currentCodePercent;

            // Smooth easing
            const speed = 0.15;
            const newPercent = currentCodePercent + diff * speed;

            this.codeDisplayWrapper.style.height = newPercent + '%';
            this.previewContainer.style.height = (100 - newPercent) + '%';

            this.updateScale();

            if (isResizing) {
                animationId = requestAnimationFrame(animateResize);
            } else {
                animationId = null;
            }
        };

        const startResize = (clientY) => {
            isResizing = true;
            this.panelResizer.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';

            // Calculate current percentage based on mouse position
            const panelRect = rightPanel.getBoundingClientRect();
            const relativeY = clientY - panelRect.top;
            targetCodePercent = (relativeY / panelRect.height) * 100;

            // Clamp between 5% and 95%
            targetCodePercent = Math.max(5, Math.min(95, targetCodePercent));

            console.log('Start resize:', targetCodePercent.toFixed(1) + '%');

            if (!animationId) {
                animationId = requestAnimationFrame(animateResize);
            }
        };

        const updateResize = (clientY) => {
            if (!isResizing) return;

            const panelRect = rightPanel.getBoundingClientRect();
            const relativeY = clientY - panelRect.top;
            targetCodePercent = (relativeY / panelRect.height) * 100;

            // Clamp between 5% and 95%
            targetCodePercent = Math.max(5, Math.min(95, targetCodePercent));

            console.log('Update resize:', targetCodePercent.toFixed(1) + '%');
        };

        const endResize = () => {
            if (isResizing) {
                isResizing = false;
                this.panelResizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        // Mouse events
        this.panelResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startResize(e.clientY);
        });

        document.addEventListener('mousemove', (e) => {
            updateResize(e.clientY);
        });

        document.addEventListener('mouseup', endResize);

        // Touch events
        this.panelResizer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startResize(e.touches[0].clientY);
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (isResizing) {
                e.preventDefault();
                updateResize(e.touches[0].clientY);
            }
        }, { passive: false });

        document.addEventListener('touchend', endResize);
    }

    // Handle user scroll - smart auto-scroll detection
    handleUserScroll() {
        if (!this.codeDisplay) return;

        // Wait a bit to see if this is user-initiated or auto-scroll
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.checkScrollPosition();
        }, 50);
    }

    checkScrollPosition() {
        if (!this.codeDisplay) return;

        const scrollTop = this.codeDisplay.scrollTop;
        const scrollHeight = this.codeDisplay.scrollHeight;
        const clientHeight = this.codeDisplay.clientHeight;

        // Faqat pastdan 100px uzoqlashsa user scroll deb hisoblash
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        if (distanceFromBottom > 100) {
            this.userScrolled = true;
        } else {
            this.userScrolled = false;
        }
    }

    // Calculate typing speed based on slider value (0-100)
    // 0% = 100ms (10 chars/sec), 100% = 10ms (100 chars/sec) - OPTIMIZED for browser
    calculateTypingSpeed(val) {
        // 100ms dan 10ms gacha lineyn pasayish (max 100 char/sec)
        return 100 - (val * 0.90);
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
        // 🛡️ NULL CHECK: inputCode mavjudligini tekshirish
        if (!this.inputCode || !this.inputCode.value) {
            this.parsedData = { title: '', style: '', body: '', hasErrors: false, errors: [] };
            return this.parsedData;
        }

        const html = this.inputCode.value.trim();
        if (!html) {
            this.parsedData = { title: '', style: '', body: '', hasErrors: false, errors: [] };
            return this.parsedData;
        }

        // Validate HTML structure
        const errors = this.validateHTML(html);

        // Extract title content
        let title = '';
        try {
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                title = titleMatch[1].trim();
            }
        } catch (e) {
            console.warn('Error parsing title:', e);
        }

        // Extract style content (between <style> and </style>)
        let style = '';
        try {
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            let styleMatch;
            while ((styleMatch = styleRegex.exec(html)) !== null) {
                if (styleMatch[1]) {
                    style += styleMatch[1].trim();
                    if (!styleMatch[1].trim().endsWith('\n')) style += '\n';
                }
            }
        } catch (e) {
            console.warn('Error parsing style:', e);
        }

        // Extract body content (between <body> and </body>)
        let body = '';
        try {
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch && bodyMatch[1]) {
                body = bodyMatch[1].trim();
            }
        } catch (e) {
            console.warn('Error parsing body:', e);
        }

        this.parsedData = {
            title: title || 'Document',
            style: style,
            body: body,
            hasErrors: errors.length > 0,
            errors: errors
        };

        console.log('[DEBUG] parseInputCode: body extracted, length:', body.length, 'preview:', body.substring(0, 100));

        // Show validation errors
        this.showErrors(errors);

        return this.parsedData;
    }

    // 🔄 Start preview - har 2 sekundda oddiy yangilanish
    startPreviewInterval() {
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
        }

        this.lastPreviewContent = '';

        // Har 2 sekundda oddiy yangilanish (fade emas)
        this.previewInterval = setInterval(() => {
            if (this.typedContent &&
                this.typedContent.length >= 10 &&
                this.typedContent !== this.lastPreviewContent) {

                this.lastPreviewContent = this.typedContent;
                this.updatePreviewSimple(); // Oddiy update (tiq-tiq)
            }
        }, 2000);
        console.log('🔄 Preview: simple update every 2 seconds');
    }

    // ⏸️ PAUSE: Tab/window dan chiqqanda typing ni to'xtatish
    pauseTyping() {
        if (this.isTyping && !this.isPaused) {
            this.wasTypingBeforeBlur = true;
            this.isPaused = true;
            console.log('⏸️ Tab switched - typing paused');
        }
    }

    // ▶️ RESUME: Tab/window ga qaytib kelganda typing ni davom ettirish
    resumeTyping() {
        if (this.wasTypingBeforeBlur) {
            this.isPaused = false;
            this.wasTypingBeforeBlur = false;
            console.log('▶️ Tab back - typing resumed');
        }
    }

    // Build complete HTML from parsed parts
    buildHTML(data) {
        // 🛡️ NULL CHECK: data obyektini tekshirish
        if (!data || typeof data !== 'object') {
            data = {};
        }

        const title = data.title || 'Document';
        const style = data.style || '';
        const body = data.body || '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>${title}</title>
    <style>
        /* Responsive base styles */
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow-x: hidden;
        }
        img, video, canvas, iframe {
            max-width: 100%;
            height: auto;
        }
${style}
    </style>
</head>
<body>
${body}
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
        // Direct scroll for input line numbers and highlight (no smooth to avoid jank)
        const scrollTop = this.inputCode.scrollTop;
        const scrollLeft = this.inputCode.scrollLeft;

        if (this.inputLineNumbers) {
            this.inputLineNumbers.scrollTop = scrollTop;
        }

        if (this.inputHighlight) {
            this.inputHighlight.scrollTop = scrollTop;
            this.inputHighlight.scrollLeft = scrollLeft;
        }
    }

    updateOutputLineNumbers() {
        const lines = this.typedContent.split('\n').length;
        this.outputLineNumbers.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
    }

    validateHTML(html) {
        const errors = [];

        // 🛡️ NULL CHECK: html string ekanligini tekshirish
        if (!html || typeof html !== 'string') {
            return errors;
        }

        try {
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
        } catch (e) {
            console.warn('Error validating HTML:', e);
        }

        return errors;
    }

    showErrors(errors) {
        // 🛡️ NULL CHECK: errorDisplay mavjudligini tekshirish
        if (!this.errorDisplay) return false;

        // 🛡️ NULL CHECK: errors array tekshirish
        if (!Array.isArray(errors)) {
            errors = [];
        }

        try {
            // Separate actual errors from warnings
            const actualErrors = errors.filter(e => e && typeof e === 'string' && e.includes('ERROR:'));
            const warnings = errors.filter(e => e && typeof e === 'string' && e.includes('WARNING:'));

            if (actualErrors.length > 0) {
                this.errorDisplay.innerHTML = '<strong>ERRORS FOUND:</strong><br>' + actualErrors.map(e => '&#8226; ' + e).join('<br>');
                this.errorDisplay.classList.remove('hidden');
                this.errorDisplay.style.background = '#3d1f1f';
                this.errorDisplay.style.color = '#f48771';
            } else if (warnings.length > 0) {
                this.errorDisplay.innerHTML = '<strong>⚠ WARNINGS:</strong><br>' + warnings.map(e => '&#8226; ' + (e ? e.replace('WARNING: ', '') : '')).join('<br>');
                this.errorDisplay.classList.remove('hidden');
                this.errorDisplay.style.background = '#3d3d1f';
                this.errorDisplay.style.color = '#f4e771';
            } else if (this.inputCode && this.inputCode.value && this.inputCode.value.trim()) {
                this.errorDisplay.innerHTML = '<strong>✓ VALID HTML</strong> - Ready to generate';
                this.errorDisplay.classList.remove('hidden');
                this.errorDisplay.style.background = '#1f3d1f';
                this.errorDisplay.style.color = '#71f487';
            } else {
                this.errorDisplay.classList.add('hidden');
            }

            // Return true only if there are actual blocking errors
            return actualErrors.length > 0;
        } catch (e) {
            console.error('Error in showErrors:', e);
            return false;
        }
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
        if (!this.previewContainer || !this.preview || !this.previewScaler) return;

        // Slider: 0 = 320px (mobile), 50 = 1280px (default), 100 = 1920px (desktop)
        const minW = 320;
        const maxW = 1920;
        const RENDER_W = Math.round(minW + (value / 100) * (maxW - minW));
        const RENDER_H = Math.round(RENDER_W * 0.625); // 16:10 ratio

        const containerW = this.previewContainer.clientWidth;
        const scale = containerW / RENDER_W;

        this.previewScaler.style.width  = RENDER_W + 'px';
        this.previewScaler.style.height = RENDER_H + 'px';
        this.previewScaler.style.transform = `scale(${scale})`;
        this.previewScaler.style.transformOrigin = 'top left';

        this.preview.style.width  = RENDER_W + 'px';
        this.preview.style.height = RENDER_H + 'px';

        // Update slider label to show current simulated width
        const vpLabel = document.getElementById('viewport-label');
        if (vpLabel) vpLabel.textContent = RENDER_W + 'px';
    }

    updateScale() {
        if (!this.previewContainer || !this.preview) return;

        const RENDER_W = 1280;   // simulated browser width
        const RENDER_H = 800;    // simulated browser height (tall enough for scroll)

        const containerW = this.previewContainer.clientWidth;
        const containerH = this.previewContainer.clientHeight;

        // Scale to fill container width exactly, no margins
        const scale = containerW / RENDER_W;

        // Apply to scaler wrapper
        if (this.previewScaler) {
            this.previewScaler.style.width  = RENDER_W + 'px';
            this.previewScaler.style.height = RENDER_H + 'px';
            this.previewScaler.style.transform = `scale(${scale})`;
            this.previewScaler.style.transformOrigin = 'top left';
        }

        // iframe itself renders at full RENDER_W — real browser behavior
        this.preview.style.width  = RENDER_W + 'px';
        this.preview.style.height = RENDER_H + 'px';

        return scale;
    }

    analyzeCode(html) {
        // Use the parsed data we already have
        if (!this.parsedData || !this.parsedData.title) {
            this.parseInputCode();
        }

        // 🛡️ NULL CHECK: parsedData obyektini tekshirish
        const parsedData = this.parsedData || {};

        const diagnostics = {
            valid: !parsedData.hasErrors,
            title: parsedData.title || 'Document',
            body: parsedData.body || '',
            style: parsedData.style || '',
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

            // 🛡️ NULL CHECK: parsedData tekshirish
            const parsedData = this.parsedData || {};
            const errors = parsedData.errors || [];

            console.log('After parseInputCode, hasErrors:', parsedData.hasErrors);

            // Check for actual blocking errors (not just warnings)
            const hasBlockingErrors = errors.some(e => e && typeof e === 'string' && e.includes('ERROR:'));
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
        // ⚡ NO FLASH: Iframe ni tozalamaslik - eski content qolaveradi
        // Yangi typing boshlanganda o'zi yangilanadi
        // this.preview.srcdoc = ''; // BU FLASH BERADI!
        this.currentChars = 0;
        this.totalChars = 0;
        this.progressValue.textContent = '0/0 chars (0.0%)';
        // Input is NOT cleared - user can edit it
        // Input highlighting is updated
        this.updateInputLineNumbers();
        this.highlightInput();
        // ⚠️ NO preview interval - prevents white flash
        // Focus the textarea so user can immediately start editing
        this.inputCode.focus();
    }

    resetOutputOnly() {
        console.log('🔄 Resetting output...');
        this.isTyping = false;
        this.isPaused = false;
        this.userScrolled = false;
        this.typedContent = '';

        // Safety check: ensure elements exist
        if (this.typedCode) {
            this.typedCode.innerHTML = '';
        }
        // ⚡ NO FLASH: Iframe ni tozalamaslik
        // if (this.preview) {
        //     this.preview.srcdoc = ''; // BU FLASH BERADI!
        // }
        if (this.outputLineNumbers) {
            this.outputLineNumbers.textContent = '1';
        }

        this.currentChars = 0;
        this.totalChars = 0;
        if (this.progressValue) {
            this.progressValue.textContent = '0/0 chars (0.0%)';
        }
        if (this.errorDisplay) {
            this.errorDisplay.classList.add('hidden');
        }
        // Smooth scroll to top for code display
        if (this.codeDisplay) {
            this.codeDisplay.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
        // Restart preview interval
        this.startPreviewInterval();
        console.log('✅ Output reset complete');
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

    async startTyping() {
        console.log('startTyping called');

        if (this.isTyping) {
            console.log('Already typing, stopping first...');
            // 🛑 NO WHITEFLASH: Iframe tozalamasdan faqat typedContent ni
            this.isTyping = false;
            this.isPaused = false;
            this.typedContent = '';
            if (this.typedCode) this.typedCode.innerHTML = '';
            // ⚠️ this.preview.srcdoc = ''; - BU WHITEFLASH BERADI!
            this.currentChars = 0;
            this.totalChars = 0;
            await this.sleep(100);
        }

        const input = this.inputCode.value.trim();
        console.log('Input length:', input.length);

        if (!input) {
            this.showErrors(['ERROR: Please enter HTML code first']);
            return;
        }

        // Parse and validate the code
        this.parseInputCode();
        console.log('Parsed data:', this.parsedData);

        // Check for actual blocking errors (with null safety)
        const errors = this.parsedData?.errors || [];
        const hasBlockingErrors = errors.some(e => e && e.includes('ERROR:'));
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
        // ⚡ NO WHITEFLASH: Don't clear preview iframe, let it show old content until new is ready

        // 🔄 LIVE: Auto-preview to'xtatilmaydi - har 2 sekundda yangilanadi

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

        // Remove typing cursor when complete
        this.removeTypingCursor();

        // Restart auto-preview after typing
        this.startPreviewInterval();
    }

    async realTyping(data) {
        console.log('realTyping started with data:', data);

        // 🛡️ NULL CHECK: data obyektini tekshirish
        if (!data || typeof data !== 'object') {
            console.error('Invalid data passed to realTyping');
            return;
        }

        const title = data.title || 'Document';
        const bodyContent = data.body || '';
        const styleContent = data.style || '';

        console.log('[DEBUG] realTyping: bodyContent length:', bodyContent.length, 'content:', bodyContent.substring(0, 100));

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
        console.log('[DEBUG] typedContent after structure:', this.typedContent.substring(this.typedContent.length - 200));

        // FIRST: Type body content if exists
        if (bodyContent) {
            console.log('Typing body content...');
            if (this.typingSpeed !== 0) {
                await this.scrollToTag('body');
                await this.sleep(300);
            }
            await this.typeIntoTag('body', bodyContent);
            console.log('[DEBUG] After typing body, typedContent length:', this.typedContent.length);
        }

        // SECOND: Type style content if exists
        if (styleContent) {
            console.log('Typing style content...');
            if (this.typingSpeed !== 0) {
                await this.scrollToTag('style');
                await this.sleep(300);
            }
            await this.typeIntoTag('style', styleContent);
        }

        // ⚡ INSTANT MODE: Update preview only once at the end
        console.log('[DEBUG] Final typedContent body section:', this.typedContent.match(/<body>[\s\S]*?<\/body>/)?.[0]?.substring(0, 200));
        console.log('⚡ Updating preview once at the end...');
        this.updateTypedCodeDisplay();
        this.updateOutputLineNumbers();
        this.updateProgressBar();
        this.autoScroll();
        this.updatePreview();
        console.log('✅ Typing complete!');

        // 🔄 Typing tugadi - oxirgi content ni saqlash
        this.lastPreviewContent = this.typedContent;
    }

    // 🔄 Typing cycle - typing tugagachgina yangi cycle
    async runTypingCycle() {
        console.log('⏱️ Starting typing cycle...');

        // 1. Avvalgi typing ni to'xtatish
        this.isTyping = false;
        this.isPaused = false;

        // 2. ⚡ NO WHITEFLASH: Reset faqat typedContent (iframe emas!)
        this.typedContent = '';
        this.currentChars = 0;
        this.totalChars = 0;
        if (this.typedCode) {
            this.typedCode.innerHTML = '';
        }
        if (this.outputLineNumbers) {
            this.outputLineNumbers.textContent = '1';
        }

        // 3. Parse current input (editor dan)
        this.parseInputCode();

        // 4. Default speed (NO localStorage) - MAX 100 char/sec
        const speedValue = 70;
        this.typingSpeed = this.calculateTypingSpeed(speedValue);

        // 5. Typing ni boshlash (iframe avvalgi holatda qoladi)
        console.log('🚀 Starting typing...');
        await this.startTyping();

        // 6. ⏱️ Typing tugagach kutish, keyin yangi cycle
        console.log('✅ Cycle complete, waiting 1 second...');
        await this.sleep(1000);

        // 7. Yangi cycle (agar auto-refresh hali yoqilmagan bo'lsa)
        if (this.autoRefreshEnabled) {
            // setTimeout bilan rekursiv stack dan qochish
            setTimeout(() => this.runTypingCycle(), 0);
        }
    }

    // 🔄 Enable auto-refresh
    enableAutoRefresh() {
        this.autoRefreshEnabled = true;
    }

    // 🔄 Disable auto-refresh
    disableAutoRefresh() {
        this.autoRefreshEnabled = false;
        // 🛑 Joriy typing ni to'xtatish (agar ishlayotgan bo'lsa)
        this.isTyping = false;
        this.isPaused = false;
        this.stopRequested = true; // Signal to stop async loops
        console.log('⏸️ Auto-refresh disabled');
    }

    // 🔄 Replay typing animation - ONLY SHOW/PREVIEW (not editor)
    async replayTypingAnimation() {
        console.log('🔄 Resetting SHOW/PREVIEW only...');

        // 1. Clear previous interval
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }

        // 2. Stop current typing
        this.isTyping = false;
        this.isPaused = false;

        // 3. ⚡ NO WHITEFLASH: Faqat typedContent ni reset qilish (iframe emas!)
        this.typedContent = '';
        if (this.typedCode) this.typedCode.innerHTML = '';
        if (this.outputLineNumbers) this.outputLineNumbers.textContent = '1';
        this.currentChars = 0;
        this.totalChars = 0;
        this.userScrolled = false;

        // ⚠️ Editor/Input NI reset QILMAYMIZ - shunchaki parse qilamiz
        this.parseInputCode();

        // 4. Wait for reset
        await this.sleep(50);

        // 5. Default speed (NO localStorage)
        const speedValue = 70;
        this.typingSpeed = this.calculateTypingSpeed(speedValue);
        this.speedSlider.value = speedValue;
        this.updateSpeedDisplay(speedValue);
        console.log('🎛️ Speed:', speedValue + '%');

        // 6. Enable auto-refresh and start cycle
        console.log('🚀 Starting show/preview replay...');
        this.enableAutoRefresh();
        this.runTypingCycle();
    }

    // Type a line with natural cursor movement
    async typeLineWithCursor(text) {
        // 🛡️ NULL CHECK: text mavjudligini tekshirish
        if (!text || typeof text !== 'string') {
            console.log('Invalid text passed to typeLineWithCursor');
            return;
        }

        console.log('typeLineWithCursor called, text length:', text.length, 'isTyping:', this.isTyping, 'speed:', this.typingSpeed);

        // CHARACTER BY CHARACTER: Always type character by character
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

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
            this.updateTypedCodeDisplay(true);
            if (!/\s/.test(char)) {
                this.currentChars++;
            }
            this.updateProgressBar();
            this.autoScroll();

            // 🎨 UPDATE: Hech qanday fade yo'q, faqat oddiy update
            // HTML va CSS da hamma narsa tiq-tiq paydo bo'ladi
            if (char === '>' || char === '}') {
                // Tag yoki CSS rule tugadi - oddiy update
                this.updatePreviewSimple();
            }

            // Normal mode with delay (4ms minimum)
            const variation = Math.random() * 20 - 10;
            await this.sleep(Math.max(4, this.typingSpeed + variation));
        }
        this.typedContent += '\n';
        this.updateTypedCodeDisplay(true);
        this.updateOutputLineNumbers();
        this.autoScroll();

        // Line tugaganda oddiy yangilanish
        this.updatePreviewSimple();
        console.log('Line complete, typedContent length:', this.typedContent.length);
    }

    updateTypedCodeDisplay(showCursor = false) {
        if (!this.typedCode) {
            console.log('typedCode element not found!');
            return;
        }

        // Always use Prism highlighting for nice visuals
        if (window.Prism && Prism.languages && Prism.languages.html) {
            // Highlight the entire content at once (correct highlighting)
            const highlighted = Prism.highlight(this.typedContent, Prism.languages.html, 'html');

            // Add cursor at the end if typing is active
            if (showCursor && this.isTyping) {
                this.typedCode.innerHTML = highlighted + '<span class="typing-cursor"></span>';
            } else {
                this.typedCode.innerHTML = highlighted;
            }
        } else {
            this.typedCode.textContent = this.typedContent;
        }
    }

    // Remove cursor when typing is complete
    removeTypingCursor() {
        if (!this.typedCode) return;

        // Re-render without cursor
        if (window.Prism && Prism.languages && Prism.languages.html) {
            const highlighted = Prism.highlight(this.typedContent, Prism.languages.html, 'html');
            this.typedCode.innerHTML = highlighted;
        } else {
            this.typedCode.textContent = this.typedContent;
        }
    }

    async typeIntoTag(tagName, content) {
        // 🛡️ NULL CHECK: tagName va content tekshirish
        if (!tagName || typeof tagName !== 'string') return;
        if (!content || typeof content !== 'string') return;

        const openTag = `<${tagName}>`;
        const closeTag = `</${tagName}>`;

        if (!content.trim()) return;

        // 🛡️ NULL CHECK: typedContent mavjudligini tekshirish
        if (!this.typedContent || typeof this.typedContent !== 'string') {
            this.typedContent = '';
        }

        // Prepare content with proper indentation
        let formattedContent = '';
        const lines = content.split('\n').filter(line => line && line.trim());

        if (tagName === 'style') {
            for (const line of lines) {
                formattedContent += '\n        ' + line.trim();
            }
        } else if (tagName === 'body') {
            for (const line of lines) {
                formattedContent += '\n    ' + line;
            }
        }

        console.log(`[DEBUG] typeIntoTag('${tagName}'): ${lines.length} lines, formatted length ${formattedContent.length}`);

        // CHARACTER BY CHARACTER: Always type content character by character
        // for visual animation effect
        const contentLines = formattedContent.split('\n');
        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            if (!line && i === 0) continue; // Skip empty first line

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const prevChar = j > 0 ? line[j - 1] : '';

                while (this.isPaused) await this.sleep(100);
                if (!this.isTyping) return;

                // Find the closing tag position (it moves as we insert)
                let currentCloseIndex = this.typedContent.indexOf(closeTag);
                if (currentCloseIndex === -1) return;

                // Insert character before closing tag
                this.typedContent = this.typedContent.substring(0, currentCloseIndex) +
                                  char +
                                  this.typedContent.substring(currentCloseIndex);

                // Cursor position is right after the inserted character
                this.updateTypedCodeDisplay(true);
                if (!/\s/.test(char)) {
                    this.currentChars++;
                }
                this.updateProgressBar();
                this.autoScroll();

                // 🎨 UPDATE: Hech qanday fade yo'q
                if (char === '>' || char === '}') {
                    // Tag yoki CSS rule tugadi - oddiy update
                    this.updatePreviewSimple();
                }

                // Natural typing variation (4ms minimum)
                const variation = Math.random() * 15 - 7;
                await this.sleep(Math.max(4, this.typingSpeed + variation));
            }

            // Add newline after each line except the last
            let closeIdxForNewline = this.typedContent.indexOf(closeTag);
            if (i < contentLines.length - 1 && closeIdxForNewline !== -1) {
                this.typedContent = this.typedContent.substring(0, closeIdxForNewline) +
                                  '\n' +
                                  this.typedContent.substring(closeIdxForNewline);
            }

            this.updateTypedCodeDisplay(true);
            this.updateOutputLineNumbers();
            this.autoScroll();
        }

        // Tag ichidagi content tugagach oddiy yangilanish
        this.updatePreviewSimple();
        console.log(`${tagName} content complete, preview updated`);
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
        if (!this.codeDisplay || this.userScrolled) return;

        // Eng oddiy va ishonchli: doim pastga scroll
        this.codeDisplay.scrollTop = this.codeDisplay.scrollHeight;
    }

    updateProgressBar() {
        if (this.totalChars === 0) return;
        this.progressValue.textContent = this.formatProgress(this.currentChars, this.totalChars);
    }

    // 🎨 SHOW: Oddiy update - typing paytida hech qanday fade yo'q
    updatePreviewSimple() {
        if (!this.typedContent || this.typedContent.length < 10) {
            return;
        }
        try {
            if (this.preview) {
                // Oddiy srcdoc yangilash - hech qanday fade effektsiz
                this.preview.srcdoc = this.typedContent;
            }
        } catch (e) {
            console.error('Simple update error:', e);
        }
    }

    // 🎨 SHOW: Smooth update - har 2 sekundda (crossfade bilan)
    updatePreviewSmooth() {
        // 🔄 Typing davomida ham smooth yangilanish
        if (this.previewUpdating || !this.typedContent || this.typedContent.length < 10) {
            return;
        }

        this.previewUpdating = true;

        // SHOW ni crossfade effekti bilan yangilash
        try {
            if (this.preview) {
                // 1️⃣ FADE OUT (0.2s) - tezroq
                this.preview.style.transition = 'opacity 0.2s ease-in-out';
                this.preview.style.opacity = '0.3';

                // 2️⃣ Yangi content yuklash
                setTimeout(() => {
                    if (this.preview) {
                        this.preview.srcdoc = this.typedContent;

                        // 3️⃣ FADE IN (0.2s) - tezroq
                        requestAnimationFrame(() => {
                            if (this.preview) {
                                this.preview.style.opacity = '1';
                            }
                            this.previewUpdating = false;
                        });
                    } else {
                        this.previewUpdating = false;
                    }
                }, 200); // 0.2s kutish
            } else {
                this.previewUpdating = false;
            }
        } catch (e) {
            console.error('Smooth update error:', e);
            this.previewUpdating = false;
        }
    }

    // 🔄 Asosiy chaqiriv
    updatePreview(smooth = false) {
        if (smooth) {
            // Smooth har doim ishlaydi (typing davomida ham)
            this.updatePreviewSmooth();
        } else {
            // Oddiy update
            this.updatePreviewSimple();
        }
    }

    reset() {
        this.isTyping = false;
        this.isPaused = false;
        this.userScrolled = false;
        this.typedContent = '';
        this.typedCode.innerHTML = '';
        // ⚡ NO FLASH: Iframe ni tozalamaslik
        // this.preview.srcdoc = ''; // BU FLASH BERADI!
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

// 🛡️ GLOBAL ERROR HANDLER: Tashqi xatoliklarni ushlash
document.addEventListener('DOMContentLoaded', () => {
    try {
        new LiveCodingApp();
    } catch (e) {
        console.error('Failed to initialize LiveCodingApp:', e);
    }
});

// 🛡️ WINDOW ERROR HANDLER: Kutilmagan xatoliklarni ushlash
window.addEventListener('error', (e) => {
    console.error('Global error caught:', e.message, 'at', e.filename, ':', e.lineno);
    // Xatoni o'z ichiga olgan bo'lsa, uni qayta ishga tushurmaslik
    if (e.message && e.message.includes('startsWith')) {
        console.warn('Ignoring startsWith error - likely from external library');
        e.preventDefault();
    }
});

// 🛡️ UNHANDLED PROMISE REJECTION HANDLER
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    // Firebase yoki boshqa kutubxonalardan kelgan xatoliklarni ushlash
    if (e.reason && typeof e.reason.message === 'string') {
        if (e.reason.message.includes('startsWith') || e.reason.message.includes('undefined')) {
            console.warn('Ignoring external library rejection');
            e.preventDefault();
        }
    }
});
