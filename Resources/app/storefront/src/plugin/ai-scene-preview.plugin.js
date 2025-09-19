import Plugin from 'src/plugin-system/plugin.class';
import AppClient from 'src/service/app-client.service';

// External app server base URL; adjust if the service is deployed elsewhere.
const FLINK_APP_SERVER_BASE_URL = 'https://apps.flinkfactory.com/ai-scene-preview';
const SCENE_PREVIEW_COOKIE_NAME = 'flink-ai-scene-preview';

export default class AiScenePreviewPlugin extends Plugin {
    static options = {
        // App server endpoints
        generateUrl: `${FLINK_APP_SERVER_BASE_URL}/api/ai-scene/generate`,
        sessionStatusUrl: `${FLINK_APP_SERVER_BASE_URL}/api/ai-scene/session-status`,
        
        // Selectors
        modalSelector: '[data-ai-scene-preview-modal]',
        debugModalSelector: '[data-ai-scene-debug-modal]',
        sceneUploadSelector: '[data-scene-upload]',
        scenePreviewSelector: '[data-scene-preview]',
        sceneInputSelector: '[data-scene-input]',
        sceneImageSelector: '[data-scene-image]',
        sceneDropzoneSelector: '[data-scene-dropzone]',
        productDisplaySelector: '[data-product-display]',
        productImageSelector: '[data-product-image]',
        productNameSelector: '[data-product-name]',
        placementOrbSelector: '[data-placement-orb]',
        loadingOverlaySelector: '[data-loading-overlay]',
        loadingMessageSelector: '[data-loading-message]',
        errorMessageSelector: '[data-error-message]',
        errorTextSelector: '[data-error-text]',
        generationsCounterSelector: '[data-generations-counter]',
        generationsAlertSelector: '[data-generations-alert]',
        generationsRemainingSelector: '[data-generations-remaining]',
        generationsMessageSelector: '[data-generations-message]',
        changeSceneSelector: '[data-change-scene]',
        debugButtonSelector: '[data-debug-button]',
        touchGhostSelector: '[data-touch-ghost]',
        debugImageSelector: '[data-debug-image]',
        debugPromptSelector: '[data-debug-prompt]'
    };

    init() {
        this.appClient = new AppClient('FlinkAiScenePreviewApp');

        this.productId = this.options.productId;
        this.productName = this.options.productName;
        this.productImageUrl = this.options.productImage;
        this.maxGenerations = this.options.maxGenerations;
        this.debugMode = this.options.debugMode;
        this.accessKey = this.options.accessKey; // Sales channel access key for Store API

        this.generationsRemainingCount = this.maxGenerations;
        this.sceneImage = null;
        this.sceneImageFile = null;
        this.isTouchDragging = false;
        this.touchGhostPosition = null;
        this.debugData = null;
        this.translations = {};
        this.isLoggedIn = false;
        this.contextToken = null;
        this.hasCookieConsent = false;

        this.loadingMessages = [
            'Analyzing your product...',
            'Surveying the scene...',
            'Describing placement location with AI...',
            'Crafting the perfect composition prompt...',
            'Generating photorealistic options...',
            'Assembling the final scene...'
        ];
        this.currentLoadingMessage = 0;
        
        this._registerEvents();
        this._getElements();

        this.isLoggedIn = this.modal ? this.modal.dataset.customerLoggedIn === 'true' : false;
        this.hasCookieConsent = this._hasCookieConsent();

        this._registerCookieConsentListener();
        this._checkAutoOpenFromQuery();

        if (this.isLoggedIn) {
            this._checkSessionStatus();
        }
    }

    _registerEvents() {
        // Main trigger button
        this.el.addEventListener('click', this._openModal.bind(this));
        
        // Modal events
        document.addEventListener('hidden.bs.modal', this._onModalHidden.bind(this));
        
        // File input change
        document.addEventListener('change', (event) => {
            if (event.target.matches(this.options.sceneInputSelector)) {
                this._handleSceneImageUpload(event.target.files[0]);
            }
        });
        
        // Change scene button
        document.addEventListener('click', (event) => {
            if (event.target.matches(this.options.changeSceneSelector)) {
                this._resetSceneUpload();
            }
        });
        
        // Debug button
        document.addEventListener('click', (event) => {
            if (event.target.matches(this.options.debugButtonSelector)) {
                this._showDebugModal();
            }
        });
        
        // Drag and drop events
        document.addEventListener('dragstart', this._handleDragStart.bind(this));
        document.addEventListener('dragover', this._handleDragOver.bind(this));
        document.addEventListener('drop', this._handleDrop.bind(this));
        document.addEventListener('click', this._handleSceneClick.bind(this));
        
        // Touch events for mobile
        document.addEventListener('touchstart', this._handleTouchStart.bind(this));
        document.addEventListener('touchmove', this._handleTouchMove.bind(this));
        document.addEventListener('touchend', this._handleTouchEnd.bind(this));
    }

    _getElements() {
        this.modal = document.querySelector(this.options.modalSelector);
        this.debugModal = document.querySelector(this.options.debugModalSelector);
        this.sceneUpload = document.querySelector(this.options.sceneUploadSelector);
        this.scenePreview = document.querySelector(this.options.scenePreviewSelector);
        this.sceneInput = document.querySelector(this.options.sceneInputSelector);
        this.sceneImage = document.querySelector(this.options.sceneImageSelector);
        this.sceneDropzone = document.querySelector(this.options.sceneDropzoneSelector);
        this.productDisplay = document.querySelector(this.options.productDisplaySelector);
        this.productImageElement = document.querySelector(this.options.productImageSelector);
        this.productNameElement = document.querySelector(this.options.productNameSelector);
        this.placementOrb = document.querySelector(this.options.placementOrbSelector);
        this.loadingOverlay = document.querySelector(this.options.loadingOverlaySelector);
        this.loadingMessage = document.querySelector(this.options.loadingMessageSelector);
        this.errorMessage = document.querySelector(this.options.errorMessageSelector);
        this.errorText = document.querySelector(this.options.errorTextSelector);
        this.generationsCounter = document.querySelector(this.options.generationsCounterSelector);
        this.generationsAlert = document.querySelector(this.options.generationsAlertSelector);
        this.generationsRemaining = document.querySelector(this.options.generationsRemainingSelector);
        this.generationsMessage = document.querySelector(this.options.generationsMessageSelector);
        this.debugButton = document.querySelector(this.options.debugButtonSelector);
        this.touchGhost = document.querySelector(this.options.touchGhostSelector);
        this.debugImage = document.querySelector(this.options.debugImageSelector);
        this.debugPrompt = document.querySelector(this.options.debugPromptSelector);

        this._initializeTranslations();
    }

    _initializeTranslations() {
        const defaults = {
            invalidImage: 'Please select a valid image file.',
            loadFailed: 'Failed to load image. Please try again.',
            noImage: 'Please upload an image first.',
            sessionLimit: 'Generation limit reached for this session.',
            generationFailed: 'We had problems placing the product in your scene. Please try again. For best results, make sure that the scene image has enough free space available to place the product in a meaningful way.',
            generationException: 'Something went wrong in the browser during generation. Please try again.',
            cookieRequired: 'Please accept the AI scene preview cookie in the consent banner to use this feature.'
        };

        this.translations = { ...defaults };

        if (!this.modal) {
            return;
        }

        const { dataset } = this.modal;

        if (dataset.loadingMessages) {
            try {
                const messages = JSON.parse(dataset.loadingMessages);
                if (Array.isArray(messages) && messages.length > 0) {
                    this.loadingMessages = messages;
                }
            } catch (error) {
                console.warn('Could not parse loading messages dataset', error);
            }
        }

        this.translations.invalidImage = dataset.errorInvalidImage || this.translations.invalidImage;
        this.translations.noImage = dataset.errorNoImage || this.translations.noImage;
        this.translations.sessionLimit = dataset.errorSessionLimit || this.translations.sessionLimit;
        this.translations.loadFailed = dataset.errorLoadFailed || this.translations.loadFailed;
        this.translations.generationFailed = dataset.errorGenerationFailed || this.translations.generationFailed;
        this.translations.generationException = dataset.errorGenerationException || this.translations.generationException;
        this.translations.cookieRequired = dataset.errorCookieRequired || this.translations.cookieRequired;
    }

    _registerCookieConsentListener() {
        if (!document || !document.$emitter || typeof document.$emitter.subscribe !== 'function') {
            return;
        }

        document.$emitter.subscribe('CookieConfiguration_Update', this._handleCookieConfigurationUpdate.bind(this));
    }

    _handleCookieConfigurationUpdate(update) {
        if (update && Object.prototype.hasOwnProperty.call(update, SCENE_PREVIEW_COOKIE_NAME)) {
            this.hasCookieConsent = update[SCENE_PREVIEW_COOKIE_NAME] === true;
        } else {
            this.hasCookieConsent = this._hasCookieConsent();
        }

        if (this.hasCookieConsent) {
            this._hideError();
        }
    }

    _hasCookieConsent() {
        return Boolean(this._getCookie(SCENE_PREVIEW_COOKIE_NAME));
    }

    _checkAutoOpenFromQuery() {
        if (!this.modal) {
            return;
        }

        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('openScenePreview') === '1') {
                this._openModal();

                params.delete('openScenePreview');
                const newQuery = params.toString();
                const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash}`;
                window.history.replaceState({}, document.title, newUrl);
            }
        } catch (error) {
            console.warn('Failed to process openScenePreview query parameter', error);
        }
    }

    _canGenerate() {
        if (!this.isLoggedIn) {
            return false;
        }

        if (!this.hasCookieConsent) {
            this._showError(this.translations.cookieRequired);
            return false;
        }

        return true;
    }

    _getContextToken() {
        if (this.contextToken) {
            return this.contextToken;
        }

        if (this.modal && this.modal.dataset && this.modal.dataset.contextToken) {
            this.contextToken = this.modal.dataset.contextToken;
            return this.contextToken;
        }

        this.contextToken = this._readContextTokenCookie();
        return this.contextToken;
    }

    _readContextTokenCookie() {
        const match = document.cookie.match(/(?:^|;\s*)sw-context-token=([^;]+)/i);
        if (!match) {
            return null;
        }

        try {
            return decodeURIComponent(match[1]);
        } catch (error) {
            console.warn('Failed to decode context token cookie', error);
            return match[1];
        }
    }

    _setContextToken(token) {
        if (!token) {
            return;
        }

        this.contextToken = token;

        if (this.modal) {
            this.modal.dataset.contextToken = token;
        }

        const cookieParts = ['sw-context-token=' + token, 'path=/', 'SameSite=Lax'];

        if (window.location.protocol === 'https:') {
            cookieParts.push('Secure');
        }

        document.cookie = cookieParts.join('; ');
    }

    _openModal() {
        // Initialize product data
        this.productImageElement.src = this.productImageUrl;
        this.productImageElement.alt = this.productName;
        this.productNameElement.textContent = this.productName;
        
        // Show modal
        const modalInstance = new bootstrap.Modal(this.modal);
        modalInstance.show();

        if (!this.hasCookieConsent) {
            this._showError(this.translations.cookieRequired);
        } else {
            this._hideError();
        }

        if (this.isLoggedIn) {
            this._updateGenerationCounter();
        }
    }

    _onModalHidden(event) {
        if (event.target === this.modal) {
            this._resetModal();
        }
    }

    _resetModal() {
        this._resetSceneUpload();
        this._hideError();
        this._hideLoadingOverlay();
        this._hidePlacementOrb();
        this.debugData = null;
        this._hideDebugButton();
    }

    _resetSceneUpload() {
        this.sceneUpload.classList.remove('d-none');
        this.scenePreview.classList.add('d-none');
        this.sceneInput.value = '';
        this.sceneImageFile = null;
        this._hidePlacementOrb();
        this._hideLoadingOverlay();
    }

    async _handleSceneImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            this._showError(this.translations.invalidImage);
            return;
        }

        try {
            const dataUrl = await this._fileToDataUrl(file);
            this.sceneImage.src = dataUrl;
            this.sceneImageFile = file;
            
            this.sceneUpload.classList.add('d-none');
            this.scenePreview.classList.remove('d-none');
            
            this._hideError();
        } catch (error) {
            console.error('Failed to load image', error);
            this._showError(this.translations.loadFailed);
        }
    }

    _handleDragStart(event) {
        if (!this._isProductDraggable(event.target)) return;
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setDragImage(this._createTransparentImage(), 0, 0);
    }

    _handleDragOver(event) {
        if (!this._isDropZone(event.target)) return;
        
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    _handleDrop(event) {
        if (!this._isDropZone(event.target)) return;
        
        event.preventDefault();

        if (!this._canGenerate()) {
            return;
        }
        
        const position = this._calculateDropPosition(event);
        if (position) {
            this._generateComposite(position);
        }
    }

    _handleSceneClick(event) {
        if (!this._isDropZone(event.target)) return;

        if (!this._canGenerate()) {
            return;
        }

        if (this.generationsRemainingCount <= 0) {
            this._showError(this.translations.sessionLimit);
            return;
        }
        
        const position = this._calculateDropPosition(event);
        if (position) {
            this._generateComposite(position);
        }
    }

    _handleTouchStart(event) {
        if (!this._isProductDraggable(event.target)) return;

        if (!this._canGenerate()) {
            return;
        }
        
        event.preventDefault();
        this.isTouchDragging = true;
        
        const touch = event.touches[0];
        this.touchGhostPosition = { x: touch.clientX, y: touch.clientY };
        
        this._showTouchGhost();
        document.body.style.overflow = 'hidden';
    }

    _handleTouchMove(event) {
        if (!this.isTouchDragging) return;
        
        event.preventDefault();
        const touch = event.touches[0];
        this.touchGhostPosition = { x: touch.clientX, y: touch.clientY };
        this._updateTouchGhost();
        
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (this._isDropZone(element)) {
            const rect = this.sceneDropzone.getBoundingClientRect();
            const position = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            this._showPlacementOrb(position);
        } else {
            this._hidePlacementOrb();
        }
    }

    _handleTouchEnd(event) {
        if (!this.isTouchDragging) return;
        
        const touch = event.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (this._isDropZone(element)) {
            const position = this._calculateTouchDropPosition(touch);
            if (position) {
                this._generateComposite(position);
            }
        }
        
        this._endTouchDrag();
    }

    _endTouchDrag() {
        this.isTouchDragging = false;
        this.touchGhostPosition = null;
        this._hideTouchGhost();
        this._hidePlacementOrb();
        document.body.style.overflow = 'auto';
    }

    async _generateComposite(position) {
        if (!this._canGenerate()) {
            return;
        }

        if (this.generationsRemainingCount <= 0) {
            this._showError(this.translations.sessionLimit);
            return;
        }

        if (!this.sceneImageFile) {
            this._showError(this.translations.noImage);
            return;
        }

        try {
            console.log('Starting generation process...');
            this._showLoadingOverlay();
            this._showPlacementOrb(position);
            this._startLoadingMessages();
            
            console.log('Converting scene image to data URL...');
            const sceneDataUrl = await this._fileToDataUrl(this.sceneImageFile);
            console.log('Scene data URL created, length:', sceneDataUrl.length);
            
            console.log('Creating request data for app server...');
            
            // Convert product image to data URL for app server
            let productImageDataUrl;
            try {
                const productImageResponse = await fetch(this.productImageUrl);
                const productImageBlob = await productImageResponse.blob();
                productImageDataUrl = await this._fileToDataUrl(productImageBlob);
            } catch (error) {
                console.warn('Could not fetch product image, using URL:', error);
                productImageDataUrl = this.productImageUrl;
            }
            
            // Create JSON payload matching app server expectations
            const requestData = {
                productId: this.productId,
                sceneImage: sceneDataUrl,
                dropPosition: {
                    xPercent: position.xPercent,
                    yPercent: position.yPercent
                },
                productName: this.productName,
                productImage: productImageDataUrl
            };
            
            console.log('Request data created for app server, productId:', this.productId);

            console.log('Making authenticated HTTP request to:', this.options.generateUrl);
            
            // Make authenticated request to app server
            const result = await this._makeAuthenticatedRequest(
                this.options.generateUrl,
                'POST',
                requestData
            );
            
            console.log('Promise resolved with success:', result.success);

            this._stopLoadingMessages();
            this._hideLoadingOverlay();
            this._hidePlacementOrb();

            if (result.success) {
                console.log('Generation successful, updating UI...');
                this.sceneImage.src = result.data.finalImage;
                this.generationsRemainingCount = result.sessionStatus.remaining;
                this._updateGenerationCounter();
                
                // Store debug data
                if (this.debugMode && result.data.debugImage) {
                    this.debugData = {
                        image: result.data.debugImage,
                        prompt: result.data.prompt
                    };
                    this._showDebugButton();
                }
                
                this._hideError();
            } else {
                console.log('Generation failed with error:', result.error);
                this._showError(result.error || this.translations.generationFailed);
                if (result.sessionStatus) {
                    this.generationsRemainingCount = result.sessionStatus.remaining;
                    this._updateGenerationCounter();
                }
            }
        } catch (error) {
            console.error('Exception in generation process:', error);
            this._stopLoadingMessages();
            this._hideLoadingOverlay();
            this._hidePlacementOrb();
            this._showError(this.translations.generationException);
        }
    }

    async _checkSessionStatus() {
        if (!this.isLoggedIn) {
            return;
        }

        try {
            console.log('Checking session status with authenticated request...');
            const result = await this._makeAuthenticatedRequest(
                this.options.sessionStatusUrl,
                'GET'
            );
            
            if (result.success) {
                this.generationsRemainingCount = result.data.remaining;
                this._updateGenerationCounter();
                console.log('Session status updated, remaining:', result.data.remaining);
            }
        } catch (error) {
            console.warn('Could not check session status:', error);
        }
    }

    _calculateDropPosition(event) {
        const rect = this.sceneDropzone.getBoundingClientRect();
        const img = this.sceneImage;
        
        if (!img.naturalWidth || !img.naturalHeight) {
            return null;
        }
        
        const imageAspectRatio = img.naturalWidth / img.naturalHeight;
        const containerAspectRatio = rect.width / rect.height;
        
        let renderedWidth, renderedHeight;
        if (imageAspectRatio > containerAspectRatio) {
            renderedWidth = rect.width;
            renderedHeight = rect.width / imageAspectRatio;
        } else {
            renderedHeight = rect.height;
            renderedWidth = rect.height * imageAspectRatio;
        }
        
        const offsetX = (rect.width - renderedWidth) / 2;
        const offsetY = (rect.height - renderedHeight) / 2;
        
        const dropX = event.clientX - rect.left;
        const dropY = event.clientY - rect.top;
        
        const imageX = dropX - offsetX;
        const imageY = dropY - offsetY;
        
        if (imageX < 0 || imageX > renderedWidth || imageY < 0 || imageY > renderedHeight) {
            return null;
        }
        
        return {
            x: dropX,
            y: dropY,
            xPercent: (imageX / renderedWidth) * 100,
            yPercent: (imageY / renderedHeight) * 100
        };
    }

    _calculateTouchDropPosition(touch) {
        const rect = this.sceneDropzone.getBoundingClientRect();
        const event = { clientX: touch.clientX, clientY: touch.clientY };
        return this._calculateDropPosition(event);
    }

    _showPlacementOrb(position) {
        this.placementOrb.style.left = position.x + 'px';
        this.placementOrb.style.top = position.y + 'px';
        this.placementOrb.classList.remove('d-none');
    }

    _hidePlacementOrb() {
        this.placementOrb.classList.add('d-none');
    }

    _showLoadingOverlay() {
        this.loadingOverlay.classList.remove('d-none');
    }

    _hideLoadingOverlay() {
        this.loadingOverlay.classList.add('d-none');
    }

    _startLoadingMessages() {
        if (!this.loadingMessage || !this.loadingMessages.length) {
            return;
        }

        this.currentLoadingMessage = 0;
        this.loadingMessage.textContent = this.loadingMessages[0];

        this.loadingInterval = setInterval(() => {
            this.currentLoadingMessage = (this.currentLoadingMessage + 1) % this.loadingMessages.length;
            this.loadingMessage.textContent = this.loadingMessages[this.currentLoadingMessage];
        }, 3000);
    }

    _stopLoadingMessages() {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
    }

    _showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('d-none');
    }

    _hideError() {
        this.errorMessage.classList.add('d-none');
    }

    _updateGenerationCounter() {
        if (!this.generationsRemaining || !this.generationsAlert) {
            return;
        }

        const alertBox = this.generationsAlert;
        const messageElement = this.generationsMessage;
        const counterWrapper = this.generationsCounter;

        alertBox.classList.remove('d-none', 'alert-warning', 'alert-info');
        if (counterWrapper) {
            counterWrapper.classList.remove('d-none');
        }

        if (this.generationsRemainingCount >= 5) {
            alertBox.classList.add('d-none');
            if (counterWrapper) {
                counterWrapper.classList.add('d-none');
            }
            if (messageElement) {
                messageElement.textContent = '';
            }
            return;
        }

        const remaining = Math.max(0, parseInt(this.generationsRemainingCount, 10) || 0);
        this.generationsRemaining.textContent = remaining;

        if (remaining <= 0) {
            alertBox.classList.add('alert-warning');
            if (messageElement) {
                const templateNone = alertBox.dataset.templateNone || '';
                messageElement.textContent = templateNone;
            }
            if (counterWrapper) {
                counterWrapper.classList.remove('d-none');
            }
            return;
        }

        alertBox.classList.add('alert-info');

        if (messageElement) {
            const templateLow = alertBox.dataset.templateLow || '';
            messageElement.textContent = templateLow.replace('%count%', remaining);
        }
    }

    _showDebugButton() {
        if (this.debugButton) {
            this.debugButton.classList.remove('d-none');
        }
    }

    _hideDebugButton() {
        if (this.debugButton) {
            this.debugButton.classList.add('d-none');
        }
    }

    _showDebugModal() {
        if (!this.debugData) return;
        
        this.debugImage.src = this.debugData.image;
        this.debugPrompt.textContent = this.debugData.prompt;
        
        const modalInstance = new bootstrap.Modal(this.debugModal);
        modalInstance.show();
    }

    _showTouchGhost() {
        const ghostImage = this.touchGhost.querySelector('.touch-ghost-image');
        ghostImage.src = this.productImageUrl;
        this.touchGhost.classList.remove('d-none');
        this._updateTouchGhost();
    }

    _hideTouchGhost() {
        this.touchGhost.classList.add('d-none');
    }

    _updateTouchGhost() {
        if (!this.touchGhostPosition) return;
        
        this.touchGhost.style.left = (this.touchGhostPosition.x - 25) + 'px';
        this.touchGhost.style.top = (this.touchGhostPosition.y - 25) + 'px';
    }

    _isProductDraggable(element) {
        return element.closest(this.options.productDisplaySelector) !== null;
    }

    _isDropZone(element) {
        return element && (
            element.matches(this.options.sceneDropzoneSelector) ||
            element.closest(this.options.sceneDropzoneSelector) !== null
        );
    }

    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _createTransparentImage() {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        return img;
    }

    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    async _ensureContextToken() {
        let token = this._getCookie('sw-context-token');
        if (token) return token;

        // Create/ensure a store-api context by calling /store-api/context
        try {
            token = await new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                // In Shopware 6.6, context supports GET (fetch) and PATCH (update)
                xhr.open('GET', '/store-api/context');
                if (this.accessKey) {
                    xhr.setRequestHeader('sw-access-key', this.accessKey);
                }
                xhr.addEventListener('loadend', () => {
                    const headerToken = xhr.getResponseHeader('sw-context-token');
                    if (headerToken) {
                        this._setContextToken(headerToken);
                        resolve(headerToken);
                    } else {
                        resolve(null);
                    }
                });
                xhr.send();
            });
        } catch (e) {
            // ignore, return null
        }

        return token;
    }

    async _makeAuthenticatedRequest(url, method = 'GET', data = null, retryCount = 0) {
        if (!this.isLoggedIn) {
            throw new Error('Login required');
        }

        await this._ensureContextToken();

        const options = {
            headers: {
                Accept: 'application/json'
            }
        };

        if (method !== 'GET' && data !== null) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        }

        try {
            let response;

            switch (method) {
                case 'GET':
                    response = await this.appClient.get(url, options);
                    break;
                case 'POST':
                    response = await this.appClient.post(url, options);
                    break;
                case 'PATCH':
                    response = await this.appClient.patch(url, options);
                    break;
                case 'DELETE':
                    response = await this.appClient.delete(url, options);
                    break;
                default:
                    throw new Error(`Unsupported request method: ${method}`);
            }

            const responseText = await response.text();
            const parsedResult = responseText ? JSON.parse(responseText) : null;

            if (response.ok) {
                return parsedResult;
            }

            if (response.status === 401 && retryCount === 0) {
                this.appClient.reset();
                return this._makeAuthenticatedRequest(url, method, data, retryCount + 1);
            }

            const errorMessage = (parsedResult && parsedResult.error) || `HTTP ${response.status} error`;
            throw new Error(errorMessage);
        } catch (error) {
            if (retryCount === 0 && error instanceof SyntaxError) {
                this.appClient.reset();
                return this._makeAuthenticatedRequest(url, method, data, retryCount + 1);
            }

            throw error;
        }
    }
}
