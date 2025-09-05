import Plugin from 'src/plugin-system/plugin.class';
import HttpClient from 'src/service/http-client.service';

export default class AiScenePreviewPlugin extends Plugin {
    static options = {
        // Shopware store-api endpoints for JWT token generation
        tokenUrl: '/store-api/app-system/FlinkAiScenePreviewApp/generate-token',
        
        // App server endpoints
        generateUrl: 'http://localhost:8083/api/ai-scene/generate',
        sessionStatusUrl: 'http://localhost:8083/api/ai-scene/session-status',
        
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
        generationsRemainingSelector: '[data-generations-remaining]',
        changeSceneSelector: '[data-change-scene]',
        debugButtonSelector: '[data-debug-button]',
        touchGhostSelector: '[data-touch-ghost]',
        debugImageSelector: '[data-debug-image]',
        debugPromptSelector: '[data-debug-prompt]'
    };

    init() {
        this.httpClient = new HttpClient();

        this.productId = this.options.productId;
        this.productName = this.options.productName;
        this.productImageUrl = this.options.productImage;
        this.maxGenerations = this.options.maxGenerations;
        this.debugMode = this.options.debugMode;

        this.generationsRemainingCount = this.maxGenerations;
        this.sceneImage = null;
        this.sceneImageFile = null;
        this.isTouchDragging = false;
        this.touchGhostPosition = null;
        this.debugData = null;
        
        // JWT token management
        this.jwtToken = null;
        this.tokenStorageKey = 'flink_ai_scene_preview_token';
        this.tokenExpirationKey = 'flink_ai_scene_preview_token_exp';
        
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
        this._checkSessionStatus();
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
        this.generationsRemaining = document.querySelector(this.options.generationsRemainingSelector);
        this.debugButton = document.querySelector(this.options.debugButtonSelector);
        this.touchGhost = document.querySelector(this.options.touchGhostSelector);
        this.debugImage = document.querySelector(this.options.debugImageSelector);
        this.debugPrompt = document.querySelector(this.options.debugPromptSelector);
    }

    _openModal() {
        // Initialize product data
        this.productImageElement.src = this.productImageUrl;
        this.productImageElement.alt = this.productName;
        this.productNameElement.textContent = this.productName;
        
        // Show modal
        const modalInstance = new bootstrap.Modal(this.modal);
        modalInstance.show();
        
        // Update counter
        this._updateGenerationCounter();
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
            this._showError('Please select a valid image file.');
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
            this._showError('Failed to load image: ' + error.message);
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
        
        const position = this._calculateDropPosition(event);
        if (position) {
            this._generateComposite(position);
        }
    }

    _handleSceneClick(event) {
        if (!this._isDropZone(event.target)) return;
        if (this.generationsRemainingCount <= 0) {
            this._showError('Generation limit reached for this session.');
            return;
        }
        
        const position = this._calculateDropPosition(event);
        if (position) {
            this._generateComposite(position);
        }
    }

    _handleTouchStart(event) {
        if (!this._isProductDraggable(event.target)) return;
        
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
        if (this.generationsRemainingCount <= 0) {
            this._showError('Generation limit reached for this session.');
            return;
        }

        if (!this.sceneImageFile) {
            this._showError('Please upload a scene image first.');
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
                this._showError(result.error || 'Server returned failure status.');
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
            this._showError('JavaScript error during generation: ' + error.message);
        }
    }

    async _checkSessionStatus() {
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
        this.generationsRemaining.parentElement.classList.remove('d-none');
        this.generationsRemaining.textContent = this.generationsRemainingCount;
        
        if (this.generationsRemainingCount <= 0) {
            this.generationsRemaining.parentElement.classList.remove('alert-info');
            this.generationsRemaining.parentElement.classList.add('alert-warning');
        }

        if (this.generationsRemainingCount > 5) {
            this.generationsRemaining.parentElement.classList.add('d-none');
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

    // JWT Token Management Methods
    async _ensureValidToken() {
        // Check if we have a valid token
        if (this._isTokenValid()) {
            return this.jwtToken;
        }

        // Request new token from Shopware
        try {
            console.log('Requesting new JWT token from Shopware...');
            const token = await this._requestNewToken();
            this._storeToken(token);
            return token;
        } catch (error) {
            console.error('Failed to obtain JWT token:', error);
            throw new Error('Authentication failed: ' + error.message);
        }
    }

    _isTokenValid() {
        // Check if we have a stored token and it's not expired
        const storedToken = sessionStorage.getItem(this.tokenStorageKey);
        const storedExpiration = sessionStorage.getItem(this.tokenExpirationKey);

        if (!storedToken || !storedExpiration) {
            return false;
        }

        const expirationTime = parseInt(storedExpiration);
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Add 1 minute buffer to avoid using tokens that are about to expire
        if (currentTime >= (expirationTime - 60)) {
            console.log('Token expired or about to expire, need to refresh');
            return false;
        }

        this.jwtToken = storedToken;
        return true;
    }

    async _requestNewToken() {
        return new Promise((resolve, reject) => {
            this.httpClient.post(
                this.options.tokenUrl,
                JSON.stringify({}),
                (responseText, request) => {
                    console.log('Token request response status:', request.status);
                    
                    if (request.status >= 200 && request.status < 300) {
                        try {
                            const response = JSON.parse(responseText);
                            if (response.token) {
                                console.log('Successfully obtained JWT token');
                                resolve(response.token);
                            } else {
                                reject(new Error('No token in response'));
                            }
                        } catch (error) {
                            console.error('Error parsing token response:', error);
                            reject(new Error('Failed to parse token response: ' + error.message));
                        }
                    } else {
                        console.error('Token request failed with status:', request.status);
                        try {
                            const errorResponse = JSON.parse(responseText);
                            reject(new Error(errorResponse.errors?.[0]?.detail || `HTTP ${request.status} error`));
                        } catch (error) {
                            reject(new Error(`HTTP ${request.status}: ${responseText}`));
                        }
                    }
                },
                'application/json'
            );
        });
    }

    _storeToken(token) {
        // Decode token to get expiration (simple base64 decode of JWT payload)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expirationTime = payload.exp;
            
            sessionStorage.setItem(this.tokenStorageKey, token);
            sessionStorage.setItem(this.tokenExpirationKey, expirationTime.toString());
            
            this.jwtToken = token;
            console.log('Token stored successfully, expires at:', new Date(expirationTime * 1000));
        } catch (error) {
            console.error('Failed to decode token:', error);
            throw new Error('Invalid token format');
        }
    }

    async _makeAuthenticatedRequest(url, method = 'GET', data = null, retryCount = 0) {
        try {
            // Ensure we have a valid token
            const token = await this._ensureValidToken();

            return new Promise((resolve, reject) => {
                console.log('Making authenticated request to:', url, 'attempt:', retryCount + 1);
                
                if (method === 'GET') {
                    this.httpClient.get(url, (responseText, request) => {
                        this._handleAuthenticatedResponse(responseText, request, resolve, reject);
                    }, 'application/json');
                } else if (method === 'POST') {
                    // For POST requests, we need to manually create the XMLHttpRequest to set custom headers
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', url);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    
                    xhr.addEventListener('loadend', () => {
                        this._handleAuthenticatedResponse(xhr.responseText, xhr, resolve, reject);
                    });
                    
                    xhr.send(data ? JSON.stringify(data) : null);
                }
            });
        } catch (authError) {
            // If we get an authentication error and haven't retried yet, try once more
            if (retryCount === 0 && authError.message.includes('Authentication failed')) {
                console.log('Authentication failed, retrying with fresh token...');
                // Clear stored token and retry once
                this._clearStoredToken();
                return this._makeAuthenticatedRequest(url, method, data, retryCount + 1);
            }
            throw authError;
        }
    }

    _clearStoredToken() {
        sessionStorage.removeItem(this.tokenStorageKey);
        sessionStorage.removeItem(this.tokenExpirationKey);
        this.jwtToken = null;
    }

    _handleAuthenticatedResponse(responseText, request, resolve, reject) {
        console.log('Authenticated request response status:', request.status);
        console.log('Response text length:', responseText ? responseText.length : 0);
        
        if (request.status >= 200 && request.status < 300) {
            try {
                const parsedResult = JSON.parse(responseText);
                console.log('Successfully parsed authenticated response, success:', parsedResult.success);
                resolve(parsedResult);
            } catch (error) {
                console.error('Error parsing authenticated response:', error);
                reject(new Error('Failed to parse server response: ' + error.message));
            }
        } else if (request.status === 401) {
            // Token might be expired, clear stored token
            console.log('Received 401, clearing stored token');
            this._clearStoredToken();
            reject(new Error('Authentication failed - token expired'));
        } else {
            console.error('HTTP error status:', request.status);
            try {
                const errorResult = JSON.parse(responseText);
                reject(new Error(errorResult.error || `HTTP ${request.status} error`));
            } catch (error) {
                reject(new Error(`HTTP ${request.status}: ${responseText}`));
            }
        }
    }
}