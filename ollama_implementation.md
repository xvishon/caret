# Ollama Integration Implementation Guide

This document outlines the implementation of Ollama model selection and refresh functionality in the Caret plugin for Obsidian.

## File Structure

The implementation spans across two main files:
- `main.ts`: Contains core functionality for fetching Ollama models
- `settings.ts`: Contains the settings UI implementation

## Core Functionality (main.ts)

### Ollama Model Fetching
```typescript
async fetchOllamaModels(): Promise<string[]> {
    try {
        const response = await requestUrl({
            url: "http://localhost:11434/api/tags",
            method: "GET",
        });
        
        const models = response.json.models;
        return models.map((model: any) => model.name);
    } catch (error) {
        console.error("Error fetching Ollama models:", error);
        new Notice("Failed to fetch Ollama models. Make sure Ollama is running with CORS enabled.");
        return [];
    }
}

async updateOllamaModels() {
    try {
        const models = await this.fetchOllamaModels();
        this.settings.ollama_models = models;
        await this.saveSettings();
    } catch (error) {
        console.error("Error updating Ollama models:", error);
    }
}
```

## Settings Implementation (settings.ts)

### Ollama Settings Section
```typescript
export class CaretSettingTab extends PluginSettingTab {
    plugin: CaretPlugin;
    
    constructor(app: App, plugin: CaretPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    async display() {
        // ... other settings code ...

        // Ollama Section
        containerEl.createEl("h3", { text: "Ollama Settings" });
        
        // Ollama Model Dropdown
        new Setting(containerEl)
            .setName("Ollama Model")
            .setDesc("Select which Ollama model to use")
            .addDropdown(async (dropdown) => {
                if (this.plugin.settings.ollama_models) {
                    for (const model of this.plugin.settings.ollama_models) {
                        dropdown.addOption(model, model);
                    }
                }
                dropdown.setValue(this.plugin.settings.model);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                });
            })
            .addExtraButton((button) => {
                button
                    .setIcon("refresh-ccw")
                    .setTooltip("Refresh Ollama Models")
                    .onClick(async () => {
                        try {
                            new Notice("Refreshing Ollama models...");
                            await this.plugin.updateOllamaModels();
                            this.display(); // Refresh the settings UI
                            new Notice("Ollama models refreshed successfully!");
                        } catch (error) {
                            console.error("Error refreshing Ollama models:", error);
                            new Notice("Failed to refresh Ollama models. Check the console for details.");
                        }
                    });
            });
    }
}
```

## Default Settings (types.ts)

Add these types to your types.ts file:

```typescript
export interface CaretPluginSettings {
    // ... other settings ...
    ollama_models: string[];
    model: string;
    llm_provider: string;
}

export const DEFAULT_SETTINGS: Partial<CaretPluginSettings> = {
    // ... other defaults ...
    ollama_models: [],
    model: "mistral",  // or your default model
    llm_provider: "ollama"
};
```

## Setup Instructions

1. Make sure to start Ollama with CORS enabled:
```bash
OLLAMA_ORIGINS=app://obsidian.md* ollama serve
```

2. Install at least one model:
```bash
ollama pull mistral
```

## Implementation Notes

1. **Error Handling**: The implementation includes comprehensive error handling with user-friendly notices.

2. **CORS Configuration**: Ollama must be started with the correct CORS settings to allow requests from Obsidian.

3. **Model Refresh**: The refresh button triggers a new fetch of available models and updates both the settings and the dropdown.

4. **Settings Persistence**: Model selections are saved in the plugin settings and persist between sessions.

5. **UI Updates**: The settings display is refreshed after model updates to show the current state.

## Troubleshooting

Common issues and solutions:

1. **Models Not Loading**
   - Verify Ollama is running
   - Check CORS settings
   - Look for errors in the developer console

2. **Model Selection Not Saving**
   - Ensure saveSettings() is called after changes
   - Check for any console errors

3. **Refresh Button Not Working**
   - Verify Ollama server is accessible
   - Check network connectivity
   - Ensure correct port configuration (default: 11434)

## Future Improvements

Potential enhancements to consider:

1. Add model status indicators
2. Implement model download progress
3. Add model parameter customization
4. Cache model list for faster loading
5. Add model version information
6. Implement model usage statistics
    