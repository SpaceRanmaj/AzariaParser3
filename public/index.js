(function() {
    const extensionName = "azaria-style-harmonizer";
    
    // Attempt to get context with retries
    let retryCount = 0;
    function getSTContext() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            return window.SillyTavern.getContext();
        }
        return null;
    }

    async function initialize() {
        const context = getSTContext();
        if (!context) {
            if (retryCount < 10) {
                retryCount++;
                setTimeout(initialize, 1000);
            }
            return;
        }

        const { addHook, event_types, extension_settings, saveSettingsDebounced } = context;

        // Default Config
        const defaultSettings = {
            enabled: true,
            mode: "external",
            backendUrl: "https://" + window.location.host,
            selectedProfile: "current",
            directives: "1. Eliminate redundant adverbs.\n2. Ensure witty tone.\n3. Stop talking like a robot.",
            systemInstruction: "You are the Azaria Style Engine. Rewrite the message to match stylistic directives.",
            presets: []
        };

        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = defaultSettings;
        }
        const settings = extension_settings[extensionName];

        async function onMessageReceived(messageId) {
            if (!settings.enabled) return;
            const chat = context.chat;
            const message = chat.find(m => m.id === messageId);
            if (!message || message.is_user) return;

            console.log("[AZARIA] Refining output stream...");

            try {
                const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sourceText: message.mes,
                        styleDirectives: settings.directives,
                        systemInstructionOverride: settings.systemInstruction
                    })
                });
                const data = await response.json();
                if (data.refinedText) {
                    message.mes = data.refinedText;
                    context.updateMessageMes(messageId, data.refinedText);
                }
            } catch (err) {
                console.error("[AZARIA] Stream interruption:", err);
            }
        }

        function buildUI() {
            if ($(`#${extensionName}-panel`).length) return;

            const html = `
                <div id="${extensionName}-panel" class="azaria-extension-panel">
                    <div class="azaria-header">
                        <span>AZARIA.STYLE_ENGINE</span>
                        <small>v1.3.0</small>
                    </div>
                    <div class="azaria-content">
                         <div class="flex-container">
                            <label><input type="checkbox" id="${extensionName}-enabled" ${settings.enabled ? 'checked' : ''}> ENABLE_MODULE</label>
                        </div>
                        
                        <div style="margin-top: 10px;">
                            <label>MODE: 
                                <select id="${extensionName}-mode">
                                    <option value="external" ${settings.mode === 'external' ? 'selected' : ''}>GEMINI_EXTERNAL</option>
                                    <option value="internal" ${settings.mode === 'internal' ? 'selected' : ''}>ST_PROFILE_BYPASS</option>
                                </select>
                            </label>
                        </div>

                        <div style="margin-top: 10px;">
                            <span>SYSTEM_PROMPT_OVERRIDE:</span>
                            <textarea id="${extensionName}-ins" style="width:100%; height:40px; background:#000; color:#0f0; border:1px solid #333;">${settings.systemInstruction}</textarea>
                        </div>

                        <div style="margin-top: 10px;">
                            <span>STYLE_DIRECTIVES:</span>
                            <textarea id="${extensionName}-dir" style="width:100%; height:80px; background:#000; color:#0f0; border:1px solid #333;">${settings.directives}</textarea>
                        </div>

                        <div style="margin-top: 10px; font-size: 9px; opacity: 0.5;">
                            SIGNAL_PATH: ${settings.backendUrl}
                        </div>
                    </div>
                </div>
            `;

            // Try multiple insertion points to be safe
            const target = $('#extensions_settings, #extension_settings, .extensions-list, .extension_settings');
            if (target.length) {
                target.first().prepend(html);
                bindEvents();
            } else {
                setTimeout(buildUI, 2000);
            }
        }

        function bindEvents() {
            $(`#${extensionName}-enabled`).on('change', function() { settings.enabled = $(this).prop('checked'); saveSettingsDebounced(); });
            $(`#${extensionName}-mode`).on('change', function() { settings.mode = $(this).val(); saveSettingsDebounced(); });
            $(`#${extensionName}-ins`).on('input', function() { settings.systemInstruction = $(this).val(); saveSettingsDebounced(); });
            $(`#${extensionName}-dir`).on('input', function() { settings.directives = $(this).val(); saveSettingsDebounced(); });
        }

        addHook(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        buildUI();
        console.log("[AZARIA] Engine bootstrapped. Precision parsing active.");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
