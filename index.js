(function() {
    const extensionName = "azaria-style-harmonizer";
    
    console.log("[AZARIA] Script loading from root...");

    // Safety check for ST context - retry if context isn't ready
    function getSTContext() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            return window.SillyTavern.getContext();
        }
        return null;
    }

    async function init(retryCount = 0) {
        const context = getSTContext();
        if (!context) {
            if (retryCount < 20) {
                console.log("[AZARIA] Waiting for SillyTavern context... (" + retryCount + ")");
                setTimeout(() => init(retryCount + 1), 750); // Increased delay
            } else {
                console.error("[AZARIA] SillyTavern context NOT found. Extension initialization aborted.");
            }
            return;
        }

        const { 
            addHook, 
            event_types, 
            extension_settings,
            saveSettingsDebounced,
            getContext,
            characters
        } = context;

        // Fetch connection profiles
        function getProfiles() {
            try {
                const ctx = getContext();
                // Check multiple locations for presets
                const profiles = ctx.api_presets || ctx.settings?.api_presets || window.SillyTavern?.api_presets || [];
                console.log("[AZARIA] Found profiles:", profiles.length);
                return Array.isArray(profiles) ? profiles : [];
            } catch (e) {
                console.warn("[AZARIA] Failed to fetch profiles:", e);
                return [];
            }
        }

        // Default Configuration
        const defaultSettings = {
            enabled: true,
            mode: "external", 
            selectedProfile: "current", 
            backendUrl: "https://" + window.location.host,
            directives: "1. Eliminate redundant adverbs.\n2. Ensure witty, cynical tone.\n3. Remove generic emotional descriptions.",
            systemInstruction: "You are an expert Output Parser. Rewrite the provided text to match stylistic directives perfectly while preserving intent.",
            presets: [
                { id: "default", name: "Default Azaria", directives: "1. Eliminate redundancy.\n2. Cynical wit.", instruction: "" }
            ]
        };

        // Initialization of settings
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = defaultSettings;
        }
        const settings = extension_settings[extensionName];

        // Export for debug
        window.AzariaHarmonizer = {
            settings,
            harmonize: (text) => harmonizeExternal(text),
            retryUI: () => buildUI(settings, getContext, saveSettingsDebounced)
        };

        // --- LOGIC ---

        async function harmonizeExternal(text) {
            try {
                const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sourceText: text,
                        styleDirectives: settings.directives,
                        systemInstructionOverride: settings.systemInstruction
                    })
                });
                const data = await response.json();
                return data.refinedText || text;
            } catch (error) {
                console.error("[AZARIA] External API failed:", error);
                return text;
            }
        }

        async function harmonizeInternal(text) {
            const prompt = `${settings.systemInstruction}\n\nSTYLE DIRECTIVES:\n${settings.directives}\n\nTEXT TO REWRITE:\n"${text}"\n\nREWRITTEN TEXT:`;
            
            try {
                const genOptions = {
                    stopped: false,
                    quiet: true
                };

                // If a specific profile is selected and it's not the active one
                if (settings.selectedProfile && settings.selectedProfile !== "current") {
                    console.log("[AZARIA] Attempting generation with profile:", settings.selectedProfile);
                    // In ST 1.12, if we have the profile name, we might need to find its config
                    // For now, we utilize the standard generateRaw which uses active.
                    // FUTURE: Swap active profile temporarily or use a targeted API.
                }
                
                const result = await context.generateRaw(prompt, genOptions);
                return result.trim().replace(/^"|"$/g, '') || text;
            } catch (error) {
                console.error("[AZARIA] Internal ST Backend failed:", error);
                return text;
            }
        }

        async function onMessageReceived(messageId) {
            if (!settings.enabled) return;

            const chat = getContext().chat;
            const message = chat.find(m => m.id === messageId);
            
            if (!message || message.is_user) return;

            console.log("[AZARIA] Refining message:", messageId);

            let refined;
            if (settings.mode === "external") {
                refined = await harmonizeExternal(message.mes);
            } else {
                refined = await harmonizeInternal(message.mes);
            }

            if (refined && refined !== message.mes) {
                message.mes = refined;
                getContext().updateMessageMes(messageId, refined);
            }
        }

        // --- UI BUILDING ---
        function buildUI(settings, getContext, saveSettingsDebounced, retryCount = 0) {
            if ($(`#${extensionName}-settings`).length) return; 

            const profiles = getProfiles();
            const profileOptions = profiles.map(p => `<option value="${p.name}" ${settings.selectedProfile === p.name ? 'selected' : ''}>${p.name}</option>`).join('');

            const html = `
                <div id="${extensionName}-settings" class="azaria-extension-panel">
                    <div class="inline-drawer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b>Azaria Style Harmonizer</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                        </div>
                        <div class="inline-drawer-content" style="display: none; padding: 10px; border: 1px dashed var(--black30);">
                            <div class="flex-container">
                                <label>
                                    <input type="checkbox" id="${extensionName}-enabled" ${settings.enabled ? 'checked' : ''}>
                                    Enable Engine (Harmonize Outputs)
                                </label>
                            </div>

                            <div class="flex-container" style="margin-top: 10px;">
                                <span>Engine Mode:</span>
                                <select id="${extensionName}-mode">
                                    <option value="external" ${settings.mode === 'external' ? 'selected' : ''}>Azaria Gemini Engine</option>
                                    <option value="internal" ${settings.mode === 'internal' ? 'selected' : ''}>ST Connection Profile</option>
                                </select>
                            </div>
                            
                            <div id="${extensionName}-internal-config" style="display: ${settings.mode === 'internal' ? 'block' : 'none'}; margin-top: 5px; font-size: 10px; color: var(--gold);">
                                <div class="flex-container">
                                    <span>Target Profile:</span>
                                    <select id="${extensionName}-profile-select" style="font-size: 9px; margin-left: 5px; flex-grow: 1;">
                                        <option value="current" ${settings.selectedProfile === 'current' ? 'selected' : ''}>[Active Profile]</option>
                                        ${profileOptions}
                                    </select>
                                </div>
                                <div style="margin-top: 3px; opacity: 0.7; font-style: italic;">
                                    Note: Using profiles other than [Active] is currently in tech-preview.
                                </div>
                            </div>
                            <!-- Rest of the UI remains the same -->
                            <div style="margin-top: 10px;">
                                <span style="font-size: 10px; opacity: 0.8;">System Instruction:</span>
                                <textarea id="${extensionName}-instruction" style="width: 100%; height: 50px; font-size: 10px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--black30);">${settings.systemInstruction}</textarea>
                            </div>

                            <div style="margin-top: 10px;">
                                <span style="font-size: 10px; opacity: 0.8;">Style Directives:</span>
                                <textarea id="${extensionName}-directives" style="width: 100%; height: 80px; font-size: 10px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--black30);">${settings.directives}</textarea>
                            </div>

                            <div class="flex-container" style="margin-top: 15px; border-top: 1px solid var(--black30); padding-top: 10px; gap: 5px;">
                                <b>Presets:</b>
                                <select id="${extensionName}-preset-list" style="flex-grow: 1; min-width: 0;">
                                    ${settings.presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                </select>
                                <button id="${extensionName}-load-preset" class="menu_button" style="padding: 2px 8px;">Load</button>
                                <button id="${extensionName}-save-preset" class="menu_button" style="padding: 2px 8px;">Save</button>
                            </div>
                            
                            <div style="margin-top: 10px; font-size: 8px; opacity: 0.5; display: flex; justify-content: space-between;">
                                <span>SYNC_URL: ${settings.backendUrl}</span>
                                <span>v1.3.2-root</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Expanded target search for 1.12
            const targets = [
                '#extensions_settings',
                '.extensions_settings',
                '#extension_settings_container', // New in 1.12 sometimes
                '#extension_settings',
                '#extensions_list',
                '#rm_extensions_block',
                '#top-bar'
            ];
            
            let container = null;
            for (const t of targets) {
                const found = $(t);
                if (found.length) {
                    container = found;
                    break;
                }
            }

            if (container) {
                // Prepend usually puts it at the top of the extensions list
                container.prepend(html);
                console.log("[AZARIA] UI injected successfully into " + container.selector);
                
                // --- EVENTS ---
                $(`#${extensionName}-enabled`).on('change', function() {
                    settings.enabled = !!$(this).prop('checked');
                    saveSettingsDebounced();
                });

                $(`#${extensionName}-mode`).on('change', function() {
                    settings.mode = $(this).val();
                    $(`#${extensionName}-internal-config`).toggle(settings.mode === 'internal');
                    saveSettingsDebounced();
                });
                
                $(`#${extensionName}-profile-select`).on('change', function() {
                    settings.selectedProfile = $(this).val();
                    saveSettingsDebounced();
                });

                $(`#${extensionName}-instruction`).on('input', function() {
                    settings.systemInstruction = $(this).val();
                    saveSettingsDebounced();
                });

                $(`#${extensionName}-directives`).on('input', function() {
                    settings.directives = $(this).val();
                    saveSettingsDebounced();
                });

                $(`#${extensionName}-load-preset`).on('click', function() {
                    const id = $(`#${extensionName}-preset-list`).val();
                    const preset = settings.presets.find(p => p.id === id);
                    if (preset) {
                        $(`#${extensionName}-instruction`).val(preset.instruction || defaultSettings.systemInstruction).trigger('input');
                        $(`#${extensionName}-directives`).val(preset.directives).trigger('input');
                    }
                });

                $(`#${extensionName}-save-preset`).on('click', function() {
                    const name = prompt("Enter preset name:");
                    if (name) {
                        const id = Date.now().toString();
                        settings.presets.push({
                            id,
                            name,
                            directives: settings.directives,
                            instruction: settings.systemInstruction
                        });
                        $(`#${extensionName}-preset-list`).append(`<option value="${id}">${name}</option>`);
                        saveSettingsDebounced();
                    }
                });
            } else {
                if (retryCount < 20) {
                    setTimeout(() => buildUI(settings, getContext, saveSettingsDebounced, retryCount + 1), 1500);
                } else {
                    console.error("[AZARIA] UI Injection failed - could not find any extension container.");
                }
            }
        }

        // Initialize hooks and build UI
        addHook(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        
        // Register Slash Command for verification
        try {
            context.registerCommand("azaria", (args) => {
                context.callToast(`Azaria Style Engine Status: ${settings.enabled ? "ACTIVE" : "DISABLED"} (${settings.mode} mode)`, "info");
                return "";
            }, ["az"], "Check Azaria Engine status");
            console.log("[AZARIA] Slash command /azaria registered.");
        } catch (e) {
            console.warn("[AZARIA] Slash command registration failed (Legacy ST?)", e);
        }

        context.callToast("Azaria Style Engine v1.3.2 LOADED", "success");
        console.log("[AZARIA] Root engine initialized. Finding UI container...");
        buildUI(settings, getContext, saveSettingsDebounced);
    }

    // Load trigger
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
