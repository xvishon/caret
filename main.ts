import { CaretSettingTab, CaretPluginSettings } from "./settings";
import React from "react";
import ChatComponent from "./chat";
import { createRoot } from "react-dom/client"; // Add this import

// @ts-ignore
import pdfjs from "@bundled-es-modules/pdfjs-dist/build/pdf";
import pdf_worker_code from "./workers/pdf.worker.js";

// Create a Blob URL from the worker code
// @ts-ignore
const pdf_worker_blob = new Blob([pdf_worker_code], { type: "application/javascript" });
const pdf_worker_url = URL.createObjectURL(pdf_worker_blob);
pdfjs.GlobalWorkerOptions.workerSrc = pdf_worker_url;

import { encodingForModel } from "js-tiktoken";
// @ts-ignore
import ollama from "ollama/browser";

import OpenAI from "openai";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { around } from "monkey-around";
import { Canvas, ViewportNode, Message, Node, Edge, SparkleConfig } from "./types";
import {
    App,
    Editor,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    ItemView,
    WorkspaceLeaf,
    setTooltip,
    setIcon,
    requestUrl,
    TFile,
} from "obsidian";
import { CanvasFileData, CanvasNodeData, CanvasTextData } from "obsidian/canvas";
import { NewNode, CustomModels } from "./types";
var parseString = require("xml2js").parseString;

import { InsertNoteModal, CMDJModal } from "./modals";
import {} from "./editorExtensions";

export const DEFAULT_SETTINGS: CaretPluginSettings = {
    caret_version: "0.2.30",
    chat_logs_folder: "caret/chats",
    chat_logs_date_format_bool: false,
    chat_logs_rename_bool: true,
    chat_send_chat_shortcut: "enter",
    model: "gpt-4-turbo",
    llm_provider: "openai",
    openai_api_key: "",
    groq_api_key: "",
    anthropic_api_key: "",
    open_router_key: "",
    context_window: 128000,
    custom_endpoints: {},
    system_prompt: "",
    temperature: 1,
    llm_provider_options: {
        openai: {
            "gpt-4-turbo": {
                name: "gpt-4-turbo",
                context_window: 128000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "gpt-3.5-turbo": {
                name: "gpt-3.5-turbo",
                context_window: 128000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "gpt-4o": {
                name: "gpt-4o",
                context_window: 128000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
        },
        groq: {
            "llama3-8b-8192": {
                name: "Llama 8B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            "llama3-70b-8192": {
                name: "Llama 70B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            "mixtral-8x7b-32768": {
                name: "Mixtral 8x7b",
                context_window: 32768,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            "gemma-7b-it": {
                name: "Gemma 7B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
        },
        anthropic: {
            "claude-3-opus-20240229": {
                name: "Claude 3 Opus",
                context_window: 200000,
                function_calling: true,
                vision: true,
                streaming: false,
            },
            "claude-3-sonnet-20240229": {
                name: "Claude 3 Sonnet",
                context_window: 200000,
                function_calling: true,
                vision: false,
                streaming: false,
            },
            "claude-3-haiku-20240307": {
                name: "Claude 3 Haiku",
                context_window: 200000,
                function_calling: true,
                vision: true,
                streaming: false,
            },
        },
        openrouter: {
            "anthropic/claude-3-opus": {
                name: "Claude 3 Opus",
                context_window: 200000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "anthropic/claude-3-sonnet": {
                name: "Claude 3 Sonnet",
                context_window: 200000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "anthropic/claude-3-haiku": {
                name: "Claude 3 Haiku",
                context_window: 200000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "google/gemini-flash-1.5": {
                name: "Gemini Flash 1.5",
                context_window: 2800000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
            "google/gemini-pro-1.5": {
                name: "Gemini Pro 1.5",
                context_window: 2800000,
                function_calling: true,
                vision: true,
                streaming: true,
            },
        },
        ollama: {
            llama3: {
                name: "llama3 8B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            phi3: {
                name: "Phi-3 3.8B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            mistral: {
                name: "Mistral 7B",
                context_window: 32768,
                function_calling: false,
                vision: false,
                streaming: true,
            },
            gemma: {
                name: "Gemma 7B",
                context_window: 8192,
                function_calling: false,
                vision: false,
                streaming: true,
            },
        },
        custom: {},
    },
    provider_dropdown_options: {
        openai: "OpenAI",
        groq: "Groq",
        ollama: "Ollama",
        anthropic: "Anthropic",
        openrouter: "OpenRouter",
        custom: "Custom",
    },
};
export const VIEW_NAME_SIDEBAR_CHAT = "sidebar-caret";
class SidebarChat extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }
    textBox: HTMLTextAreaElement;
    messagesContainer: HTMLElement; // Container for messages

    getViewType() {
        return VIEW_NAME_SIDEBAR_CHAT;
    }

    getDisplayText() {
        return VIEW_NAME_SIDEBAR_CHAT;
    }

    async onOpen() {
        const metacontainer = this.containerEl.children[1];
        metacontainer.empty();
        const container = metacontainer.createEl("div", {
            cls: "container",
        });
        metacontainer.prepend(container);
        // this.containerEl.appendChild(container);

        // Create a container for messages
        this.messagesContainer = container.createEl("div", {
            cls: "messages-container",
        });

        // Add a "Hello World" message
        this.addMessage("MLX Testing", "system");
        this.createChatInputArea(container);
    }
    createChatInputArea(container: HTMLElement) {
        // Create a container for the text box and the submit button
        const inputContainer = container.createEl("div", {
            cls: "chat-input-container",
        });

        // Create the text box within the input container
        this.textBox = inputContainer.createEl("textarea", {
            cls: "full_width_text_container",
        });
        this.textBox.placeholder = "Type something...";

        // Create the submit button within the input container
        const button = inputContainer.createEl("button");
        button.textContent = "Submit";
        button.addEventListener("click", () => {
            this.submitMessage(this.textBox.value);
            this.textBox.value = ""; // Clear the text box after sending
        });
    }

    addMessage(text: string, sender: "user" | "system") {
        const messageDiv = this.messagesContainer.createEl("div", {
            cls: `message ${sender}`,
        });
        messageDiv.textContent = text;
    }

    submitMessage(userMessage: string) {
        let current_page_content = "";
        if (userMessage.includes("@current")) {
            // Find the first MarkdownView that is open in the workspace
            const markdownView = this.app.workspace
                .getLeavesOfType("markdown")
                // @ts-ignore
                .find((leaf) => leaf.view instanceof MarkdownView && leaf.width > 0)?.view as MarkdownView;
            if (markdownView && markdownView.editor) {
                current_page_content = markdownView.editor.getValue();
            }
        }
        this.addMessage(userMessage, "user"); // Display the user message immediately

        const current_page_message = `
		${userMessage}

		------ Note for Model ---
		When I am referring to @current, I meant the following:

		${current_page_content}
		`;

        let final_message = userMessage;
        if (current_page_content.length > 0) {
            final_message = current_page_message;
        }

        const data = { message: final_message };
        fetch("http://localhost:8000/conversation", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        })
            .then((response) => response.json())
            .then((data) => {
                this.addMessage(data.response, "system"); // Display the response
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }

    async onClose() {
        // Cleanup logic if necessary
    }
}
export const VIEW_NAME_MAIN_CHAT = "main-caret";
class FullPageChat extends ItemView {
    chat_id: string;
    plugin: any;
    conversation_title: string;
    textBox: HTMLTextAreaElement;
    messagesContainer: HTMLElement; // Container for messages
    conversation: Message[]; // List to store conversation messages
    is_generating: boolean;
    chatComponentRef: any;
    file_name: string;

    constructor(
        plugin: any,
        leaf: WorkspaceLeaf,
        chat_id?: string,
        conversation: Message[] = [],
        file_name: string = ""
    ) {
        super(leaf);
        this.plugin = plugin;
        this.chat_id = chat_id || this.generateRandomID(5);
        this.conversation = conversation; // Initialize conversation list with default or passed value
        this.file_name = file_name;
    }

    getViewType() {
        return VIEW_NAME_MAIN_CHAT;
    }

    getDisplayText() {
        if (this.file_name.length > 1) {
            return `Chat: ${this.file_name}`;
        }
        return `Chat: ${this.chat_id}`;
    }

    async onOpen() {
        const metacontainer = this.containerEl.children[1];
        metacontainer.empty();
        const container = metacontainer.createEl("div", {
            cls: "container",
        });
        metacontainer.prepend(container);

        // Create a container for messages
        this.messagesContainer = container.createEl("div", {
            cls: "messages-container",
        });

        // Render the React component using createRoot
        // Render the React component using createRoot
        const root = createRoot(this.messagesContainer);
        const chatComponent = React.createElement(ChatComponent, {
            plugin: this.plugin,
            chat_id: this.chat_id,
            initialConversation: this.conversation,
            onSubmitMessage: this.submitMessage.bind(this),
            onSave: this.handleSave.bind(this), // Add this line
            onBulkConvert: this.bulkConvert.bind(this),
            onNewChat: this.newChat.bind(this),
            onInsertNote: this.handleInsertNote.bind(this),
            ref: (ref) => {
                this.chatComponentRef = ref;
            }, // Set the ref here
        });
        root.render(chatComponent);
    }
    async submitMessage(userMessage: string) {
        if (this.chatComponentRef) {
            await this.chatComponentRef.submitMessage(userMessage);
        }
    }
    handleInsertNote(callback: (note: string) => void) {
        console.log("Handle insert note is being called??");
        new InsertNoteModal(this.app, this.plugin, (note: string) => {
            console.log("Selected note:", note);
            callback(note); // Call the callback with the note value
        }).open();
    }
    bulkConvert(checkedContents: string[]) {
        if (checkedContents.length < 1) {
            new Notice("No selected messages to convert to note");
        }
        new ConvertTextToNoteModal(this.app, this.plugin, checkedContents).open();
    }
    handleSave() {
        // You can access the conversation state from the chatComponentRef if needed
        if (this.chatComponentRef) {
            const conversation = this.chatComponentRef.getConversation(); // Call the getConversation method
            // Save the conversation or perform any other actions
            this.conversation = conversation;
            this.saveChat();
        }
    }

    addMessage(text: string, sender: "user" | "assistant") {
        const newMessage = { content: text, role: sender };
        // Add message to the conversation array
        // this.conversation.push(newMessage);
        // Update the conversation in the React component
        if (this.chatComponentRef) {
            this.chatComponentRef.addMessage(newMessage);
        }
    }

    async streamMessage(stream_response: AsyncIterable<any>) {
        if (this.plugin.settings.llm_provider === "ollama") {
            for await (const part of stream_response) {
                this.conversation[this.conversation.length - 1].content += part.message.content;
                if (this.chatComponentRef) {
                    this.chatComponentRef.updateLastMessage(part.message.content);
                }
            }
        }
        if (this.plugin.settings.llm_provider === "openai" || "groq" || "custom") {
            for await (const part of stream_response) {
                const delta_content = part.choices[0]?.delta.content || "";
                this.conversation[this.conversation.length - 1].content += delta_content;
                if (this.chatComponentRef) {
                    this.chatComponentRef.updateLastMessage(delta_content);
                }
            }
        }
    }

    focusAndPositionCursorInTextBox() {
        this.textBox.focus();
    }

    insert_text_into_user_message(text: string) {
        this.textBox.value += text.trim() + " ";
    }

    escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case "&":
                    return "&amp;";
                case "'":
                    return "&apos;";
                case '"':
                    return "&quot;";
                default:
                    return c;
            }
        });
    }
    async newChat() {
        const currentLeaf = this.app.workspace.activeLeaf;
        if (currentLeaf) {
            // This would detach it if we wanted to it. But it causes bugs below.
            // I actually like the UX this way.
            // currentLeaf?.detach();
        }

        const new_leaf = await this.app.workspace.getLeaf(true);
        new_leaf.setViewState({
            type: VIEW_NAME_MAIN_CHAT,
            active: true,
        });
    }

    async saveChat() {
        // Prep the contents itself to be saved

        let file_content = `\`\`\`xml
        <root>
		<metadata>\n<id>${this.chat_id}</id>\n</metadata>
		`;

        let messages = ``;
        if (this.conversation.length === 0) {
            return;
        }
        for (let i = 0; i < this.conversation.length; i++) {
            const message = this.conversation[i];
            const escaped_content = this.escapeXml(message.content);
            const message_xml = `
                <message>
                    <role>${message.role}</role>
                    <content>${escaped_content}</content>
                </message>
            `.trim();
            messages += message_xml;
        }
        let conversation = `<conversation>\n${messages}</conversation></root>\`\`\``;
        file_content += conversation;

        // And then get the actual save file
        const chat_folder_path = this.plugin.settings.chat_logs_folder;

        const chat_folder = this.app.vault.getAbstractFileByPath(chat_folder_path);
        if (!chat_folder) {
            await this.app.vault.createFolder(chat_folder_path);
        }
        let file_to_save_to = await this.plugin.getChatLog(chat_folder_path, this.chat_id);

        let new_chat = true;
        if (file_to_save_to && file_to_save_to.path) {
            new_chat = false;
        }

        const date = new Date();
        const year = date.getFullYear();
        const month = ("0" + (date.getMonth() + 1)).slice(-2);
        const day = ("0" + date.getDate()).slice(-2);
        const date_path = `/${year}/${month}/${day}`;

        if (this.plugin.settings.chat_logs_date_format_bool) {
            const fullPath = chat_folder_path + date_path;
            const pathSegments = fullPath.split("/");
            let currentPath = "";
            for (const segment of pathSegments) {
                if (segment !== "") {
                    currentPath += segment;
                    const folderExists = this.app.vault.getAbstractFileByPath(currentPath);
                    if (!folderExists) {
                        await this.app.vault.createFolder(currentPath);
                    }
                    currentPath += "/";
                }
            }
        }

        if (new_chat) {
            const file_name = `${this.chat_id}.md`;
            let file_path = chat_folder_path + "/" + file_name;
            if (this.plugin.settings.chat_logs_date_format_bool) {
                file_path = chat_folder_path + date_path + "/" + file_name;
            }
            const new_file_created = await this.app.vault.create(file_path, file_content);
            if (this.plugin.settings.chat_logs_rename_bool) {
                await this.name_new_chat(new_file_created);
            }
        } else {
            const file = await this.app.vault.getFileByPath(file_to_save_to.path);
            if (!file) {
                new Notice("Failed to save file");
                throw new Error("Failed to save file");
            }
            await this.app.vault.modify(file, file_content);
        }
    }
    async name_new_chat(new_file: any) {
        let new_message = `
Please create a title for this conversation. Keep it to 3-5 words at max. Be as descriptive with that as you can be.\n\n

Respond in plain text with no formatting.
`;
        for (let i = 0; i < this.conversation.length; i++) {
            const message = this.conversation[i];
            new_message += `${message.role}:\n${message.content}`;
        }
        const conversation = [{ role: "user", content: new_message }];
        const output = await this.plugin.llm_call(
            this.plugin.settings.llm_provider,
            this.plugin.settings.model,
            conversation
        );
        const path = new_file.path;
        const newPath = `${path.substring(0, path.lastIndexOf("/"))}/${output}.md`;
        await this.app.vault.rename(new_file, newPath);
    }

    generateRandomID(length: number) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async onClose() {
        // Cleanup logic if necessary
    }
}

class ConvertTextToNoteModal extends Modal {
    plugin: any;
    messages: string[];
    formatting_prompt: string = "Format the below content into a nice markdown document.";
    fileName: string = "";
    apply_formatting: boolean = true;

    constructor(app: App, plugin: any, messages: string[]) {
        super(app);
        this.plugin = plugin;
        this.messages = messages;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Convert Text to Note" });
        contentEl.createEl("div", { text: `Converting ${this.messages.length} messages`, cls: "callout" });

        new Setting(contentEl)
            .setName("File Name")
            .setDesc("Enter the name for the note.")
            .addText((text) => {
                text.setValue(this.fileName).onChange((value) => {
                    this.fileName = value;
                });
            });

        new Setting(contentEl)
            .setName("Auto Format")
            .setDesc("Apply prompt formatting to the note.")
            .addToggle((toggle) => {
                toggle.setValue(this.apply_formatting).onChange((value) => {
                    this.apply_formatting = value;
                });
            });
        const textArea = contentEl.createEl("textarea", {
            text: this.formatting_prompt,
            cls: "content-l w-full h-20",
            placeholder: "Enter the formatting song.",
        });
        textArea.onchange = (event) => {
            this.formatting_prompt = (event.target as HTMLTextAreaElement).value;
        };

        new Setting(contentEl).addButton((button) => {
            button.setButtonText("Submit").onClick(async () => {
                if (!this.fileName || this.fileName.trim() === "") {
                    new Notice("File name must be set before saving");
                    console.error("Validation Error: File name must exist");
                    return;
                }

                let final_content = this.messages.join("\n");
                if (this.apply_formatting) {
                    if (this.formatting_prompt.length < 1) {
                        new Notice("Must have formatting prompt");
                        return;
                    }
                    let final_prompt = `${this.formatting_prompt}\n\n${this.messages.join("\n")}`;
                    const conversation = [{ role: "user", content: final_prompt }];
                    const response = await this.plugin.llm_call(
                        this.plugin.settings.llm_provider,
                        this.plugin.settings.model,
                        conversation
                    );
                    final_content = response;
                }

                const file_path = `${this.fileName}.md`;

                // Check if the file path contains parentheses
                if (file_path.includes("/")) {
                    const pathParts = file_path.split("/");
                    let currentPath = "";
                    for (const part of pathParts.slice(0, -1)) {
                        currentPath += part;
                        const folder = await this.app.vault.getAbstractFileByPath(currentPath);
                        if (!folder) {
                            try {
                                await this.app.vault.createFolder(currentPath);
                            } catch (error) {
                                console.error("Failed to create folder:", error);
                            }
                        }
                        currentPath += "/";
                    }
                }
                const file = await this.app.vault.getFileByPath(file_path);

                try {
                    if (file) {
                        new Notice("File exists already, please choose another name");
                    } else {
                        await this.app.vault.create(file_path, final_content);
                        new Notice("Chat saved to note");
                        this.close();
                    }
                } catch (error) {
                    console.error("Failed to save note:", error);
                }
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class CustomModelModal extends Modal {
    model_id: string = "";
    model_name: string = "";
    streaming: boolean = true;
    vision: boolean = false;
    function_calling: boolean = false;
    context_window: number = 0;
    url: string = "";
    api_key: string = "";
    plugin: any;
    known_provider: string = "";

    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Add Custom Model" });
        contentEl.createEl("div", { text: "Note: The model needs to support the OpenAI spec.", cls: "callout" });
        contentEl.createEl("div", {
            text: "Note: The endpoint needs to support CORS. This is experimental and might require additional CORS settings to be added to Caret. Let me know!",
            cls: "callout",
        });

        new Setting(contentEl)
            .setName("Model ID")
            .setDesc("This is the model. This is the value for the model parameter that will be sent to the endpoint.")
            .addText((text) => {
                text.setValue(this.model_id).onChange((value) => {
                    this.model_id = value;
                });
            });

        new Setting(contentEl)
            .setName("Model Name")
            .setDesc("This is the human-friendly name only used for displaying.")
            .addText((text) => {
                text.setValue(this.model_name).onChange((value) => {
                    this.model_name = value;
                });
            });

        new Setting(contentEl)
            .setName("Vision")
            .setDesc("Not used currently, will be used to know if the model can process pictures.")
            .addToggle((toggle) => {
                toggle.setValue(this.vision).onChange((value) => {
                    this.vision = value;
                });
            });
        new Setting(contentEl)
            .setName("Function Calling")
            .setDesc("Does the model support function calling?")
            .addToggle((toggle) => {
                toggle.setValue(this.function_calling).onChange((value) => {
                    this.function_calling = value;
                });
            });

        new Setting(contentEl)
            .setName("Context Size")
            .setDesc("You can normally pull this out of the Hugging Face repo, the config.json.")
            .addText((text) => {
                text.setValue(this.context_window.toString()).onChange((value) => {
                    this.context_window = parseInt(value);
                });
            });

        new Setting(contentEl)
            .setName("Custom Endpoint")
            .setDesc("This is where the model is located. It can be a remote URL or a server URL running locally.")
            .addText((text) => {
                text.setValue(this.url).onChange((value) => {
                    this.url = value;
                });
            });

        new Setting(contentEl)
            .setName("API Key")
            .setDesc("This is the API key required to access the model.")
            .addText((text) => {
                text.setValue(this.api_key).onChange((value) => {
                    this.api_key = value;
                });
            });

        new Setting(contentEl)
            .setName("Known Provider")
            .setDesc("Select this if it's a known endpoint like Ollama.")
            .addDropdown((dropdown) => {
                dropdown.addOption("ollama", "Ollama");
                dropdown.addOption("openrouter", "OpenRouter");
                dropdown.setValue(this.known_provider).onChange((value) => {
                    this.known_provider = value;
                });
            });
        new Setting(contentEl).addButton((button) => {
            button.setButtonText("Submit").onClick(async () => {
                const settings: CaretPluginSettings = this.plugin.settings;
                const parsed_context_window = parseInt(this.context_window.toString());

                if (!this.model_name || this.model_name.trim() === "") {
                    new Notice("Model name must exist");
                    console.error("Validation Error: Model name must exist");
                    return;
                }

                if (
                    (!this.url || this.url.trim() === "") &&
                    (!this.known_provider || this.known_provider.trim() === "")
                ) {
                    new Notice("Either endpoint or known provider must be set");
                    console.error("Validation Error: Either endpoint or known provider must be set");
                    return;
                }

                if (!this.model_id || this.model_id.trim() === "") {
                    new Notice("Model ID must have a value");
                    console.error("Validation Error: Model ID must have a value");
                    return;
                }

                if (isNaN(parsed_context_window)) {
                    new Notice("Context window must be a number");
                    console.error("Validation Error: Context window must be a number");
                    return;
                }
                const new_model: CustomModels = {
                    name: this.model_name,
                    context_window: this.context_window,
                    function_calling: this.function_calling, // Assuming default value as it's not provided in the form
                    vision: this.vision,
                    streaming: true,
                    endpoint: this.url,
                    api_key: this.api_key,
                    known_provider: this.known_provider,
                };

                settings.custom_endpoints[this.model_id] = new_model;

                await this.plugin.saveSettings();

                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class RemoveCustomModelModal extends Modal {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Remove Custom Model", cls: "insert-file-header" });

        // Set the width of the modal
        modalEl.style.width = "800px"; // Adjust the width as needed

        const table = contentEl.createEl("table", { cls: "custom-models-table" });
        const headerRow = table.createEl("tr");
        headerRow.createEl("th", { text: "Name" });
        headerRow.createEl("th", { text: "Context Window" });
        headerRow.createEl("th", { text: "URL" });
        headerRow.createEl("th", { text: "Action" });

        const custom_models: { [key: string]: CustomModels } = this.plugin.settings.custom_endpoints;

        for (const [model_id, model] of Object.entries(custom_models)) {
            const row = table.createEl("tr");

            row.createEl("td", { text: model.name });
            row.createEl("td", { text: model.context_window.toString() });
            row.createEl("td", { text: model.endpoint });

            const deleteButtonContainer = row.createEl("td", { cls: "delete-btn-container" });
            const deleteButton = deleteButtonContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
            deleteButton.addEventListener("click", async () => {
                delete custom_models[model_id];
                await this.plugin.saveSettings();
                this.onOpen(); // Refresh the modal to reflect changes
            });
        }

        // Apply minimum width to contentEl
        contentEl.style.minWidth = "600px";
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SystemPromptModal extends Modal {
    plugin: any;
    system_prompt: string = "";

    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "System Prompt" });

        const textArea = contentEl.createEl("textarea", {
            cls: "system-prompt-textarea",
            text: this.plugin.settings.system_prompt || "",
        });
        textArea.style.height = "400px";
        textArea.style.width = "100%";

        const submitButton = contentEl.createEl("button", { text: "Submit", cls: "mod-cta" });
        submitButton.addEventListener("click", async () => {
            this.plugin.settings.system_prompt = textArea.value;
            new Notice("System prompt updated");
            await this.plugin.saveSettings();
            await this.plugin.loadSettings();
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

interface WorkflowPrompt {
    model: string;
    provider: string;
    delay: string;
    temperature: string;
    prompt: string;
}

class LinearWorkflowEditor extends ItemView {
    plugin: any;
    file_path: string;
    prompts: WorkflowPrompt[];
    workflow_name: string;
    system_prompt: string;
    prompt_container: HTMLDivElement;
    stored_file_name: string;
    workflow_type: "linear" | "parallel";

    constructor(plugin: any, leaf: WorkspaceLeaf, file_path: string = "") {
        super(leaf);
        this.plugin = plugin;
        this.file_path = file_path;
        this.prompts = [];
        this.workflow_name = "";
        this.system_prompt = "";
    }

    getViewType() {
        return "workflow-editor";
    }

    getDisplayText() {
        return "Workflow Editor";
    }

    async onOpen() {
        if (this.file_path) {
            const file = this.app.vault.getAbstractFileByPath(this.file_path);
            if (file) {
                const front_matter = await this.plugin.get_frontmatter(file);
                this.workflow_type = front_matter.caret_prompt;
                let file_content;
                if (file instanceof TFile) {
                    file_content = await this.app.vault.cachedRead(file);
                    this.workflow_name = file.name.replace(".md", "");
                    this.stored_file_name = file.name;
                } else {
                    throw new Error("The provided file is not a valid TFile.");
                }
                this.workflow_name = file.name.replace(".md", "");
                this.stored_file_name = file.name;
                const xml_content = file_content.match(/```xml([\s\S]*?)```/)?.[1]?.trim() ?? "";
                const xml = await this.plugin.parseXml(xml_content);
                const xml_prompts = xml?.root?.prompt ?? [];

                for (let i = 0; i < xml_prompts.length; i++) {
                    const prompt = xml_prompts[i]._.trim();
                    const delay = parseInt(xml_prompts[i].$.delay) || 0;
                    const model = xml_prompts[i].$.model || "default";
                    const provider = xml_prompts[i].$.provider || "default";
                    const temperature = parseFloat(xml_prompts[i].$.temperature) || this.plugin.settings.temperature;

                    if (prompt.trim().length > 0) {
                        this.prompts.push({
                            model,
                            provider,
                            delay: delay.toString(),
                            temperature: temperature.toString(),
                            prompt,
                        });
                    }
                }

                if (xml.root.system_prompt && xml.root.system_prompt.length > 0) {
                    if (xml.root.system_prompt && xml.root.system_prompt[0] && xml.root.system_prompt[0]._) {
                        this.system_prompt = xml.root.system_prompt[0]._.trim();
                    } else {
                        this.system_prompt = "";
                    }
                } else {
                    this.system_prompt = "";
                }
                // Process file content and initialize prompts if necessary
            }
        }

        const metacontainer = this.containerEl.children[1];
        metacontainer.empty();
        const container = metacontainer.createEl("div", {
            cls: "workflow_container",
        });
        metacontainer.prepend(container);

        // Add description

        // Add workflow name input
        const title_container = container.createEl("div", { cls: "flex-row" });
        title_container.createEl("h2", { text: `Workflow Name:`, cls: "w-8" });
        const workflow_name_input = title_container.createEl("input", {
            type: "text",
            cls: "workflow-name-input w-full",
            value: this.workflow_name,
        });
        container.createEl("p", { text: "Add prompts that will then be run in a linear fashion on any input." });
        workflow_name_input.addEventListener("input", () => {
            this.workflow_name = workflow_name_input.value;
        });

        this.prompt_container = container.createEl("div", { cls: "w-full" });

        // Create the system message right away
        this.add_system_prompt();
        if (this.prompts.length > 0) {
            for (let i = 0; i < this.prompts.length; i++) {
                this.add_prompt(this.prompts[i], true, i);
            }
        } else {
            this.add_prompt();
        }

        // Create a button to add new prompts
        const buttonContainer = container.createEl("div", { cls: "button-container bottom-screen-padding" });

        const addPromptButton = buttonContainer.createEl("button", { text: "Add New Prompt" });
        addPromptButton.addEventListener("click", () => {
            this.add_prompt();
        });

        // Create a save workflow button
        const save_button = buttonContainer.createEl("button", { text: "Save Workflow" });
        save_button.addEventListener("click", () => {
            if (this.workflow_name.length === 0) {
                new Notice("Workflow must be named before saving");
                return;
            }

            for (let i = 0; i < this.prompts.length; i++) {
                const prompt = this.prompts[i];
                if (!prompt.model) {
                    new Notice(`Prompt ${i + 1}: Model must have a value`);
                    return;
                }
                if (!prompt.provider) {
                    new Notice(`Prompt ${i + 1}: Provider must have a value`);
                    return;
                }
                const delay = parseInt(prompt.delay, 10);
                if (isNaN(delay) || delay < 0 || delay > 60) {
                    new Notice(`Prompt ${i + 1}: Delay must be a number between 0 and 60`);
                    return;
                }
                const temperature = parseFloat(prompt.temperature);
                if (isNaN(temperature) || temperature < 0 || temperature > 2) {
                    new Notice(`Prompt ${i + 1}: Temperature must be a float between 0 and 2`);
                    return;
                }
                if (!prompt.prompt || prompt.prompt.length === 0) {
                    new Notice(`Prompt ${i + 1}: Prompt must not be empty`);
                    return;
                }
            }

            this.save_workflow();
        });
    }

    async save_workflow() {
        const chat_folder_path = "caret/workflows";
        const chat_folder = this.app.vault.getAbstractFileByPath(chat_folder_path);
        if (!chat_folder) {
            await this.app.vault.createFolder(chat_folder_path);
        }
        const system_prompt_string = `
<system_prompt tag="placeholder_do_not_delete">
${this.plugin.escapeXml(this.system_prompt)}
</system_prompt>
`;

        let prompts_string = ``;
        for (let i = 0; i < this.prompts.length; i++) {
            if (this.prompts[i].prompt.length === 0) {
                continue;
            }
            const escaped_content = this.plugin.escapeXml(this.prompts[i].prompt);
            prompts_string += `
<prompt model="${this.prompts[i].model || "default"}" provider="${this.prompts[i].provider || "default"}" delay="${
                this.prompts[i].delay || "default"
            }" temperature="${this.prompts[i].temperature || "default"}">
${escaped_content}
</prompt>`.trim();
        }

        let file_content = `
---
caret_prompt: ${this.workflow_type}
version: 1
---
\`\`\`xml
<root>
${system_prompt_string}
${prompts_string}
</root>
\`\`\`
        `.trim();

        let file_name = `${this.workflow_name}.md`;
        let file_path = `${chat_folder_path}/${file_name}`;
        let old_file_path = `${chat_folder_path}/${this.stored_file_name}`;
        let file = await this.app.vault.getFileByPath(old_file_path);

        try {
            if (file) {
                if (old_file_path !== file_path) {
                    await this.app.vault.rename(file, file_path);
                }
                await this.app.vault.modify(file, file_content);
                new Notice("Workflow Updated!");
            } else {
                await this.app.vault.create(file_path, file_content);
                new Notice("Workflow Created!");
            }
        } catch (error) {
            console.error("Failed to save chat:", error);
            if (error.message.includes("File already exists")) {
                new Notice("A workflow with that name already exists!");
            } else {
                console.error("Failed to save chat:", error);
            }
        }
    }

    add_system_prompt(system_prompt: string = "") {
        // Add a toggle switch for workflow type
        const dropdown_container = this.prompt_container.createEl("div", {
            cls: "dropdown-container",
        });

        dropdown_container.createEl("label", { text: "Workflow Type: ", cls: "dropdown-label" });

        const workflow_type_select = dropdown_container.createEl("select", {
            cls: "workflow-type-select",
        });

        const options = [
            { value: "linear", text: "Linear Workflow" },
            { value: "parallel", text: "Parallel Workflow" },
        ];

        options.forEach((option) => {
            const opt = workflow_type_select.createEl("option", {
                value: option.value,
                text: option.text,
            });
            if (this.workflow_type === option.value) {
                opt.selected = true;
            }
        });

        workflow_type_select.addEventListener("change", (event) => {
            this.workflow_type = (event.target as HTMLSelectElement).value as "linear" | "parallel";
            new Notice(`Workflow type set to ${this.workflow_type}`);
        });

        this.prompt_container.createEl("h3", { text: "System Prompt" });
        const text_area = this.prompt_container.createEl("textarea", {
            cls: "full_width_text_container",
            placeholder: "Add a system prompt",
        });
        text_area.value = this.system_prompt;

        text_area.addEventListener("input", () => {
            this.system_prompt = text_area.value;
        });
    }

    add_prompt(
        prompt: WorkflowPrompt = { model: "default", provider: "default", delay: "0", temperature: "1", prompt: "" },
        loading_prompt: boolean = false,
        index: number | null = null
    ) {
        let step_number = index !== null ? index + 1 : this.prompts.length + 1;
        let array_index = index !== null ? index : this.prompts.length;

        if (step_number === 1) {
            step_number = 1;
        }
        this.prompt_container.createEl("h3", { text: `Prompt ${step_number}` });

        const text_area = this.prompt_container.createEl("textarea", {
            cls: `w-full workflow_text_area text_area_id_${step_number}`,
            placeholder: "Add a step into your workflow",
        });
        text_area.value = prompt.prompt;
        text_area.id = `text_area_id_${step_number}`;
        // Create a container div with class flex-row
        const options_container = this.prompt_container.createEl("div", {
            cls: "flex-row",
        });
        // Provider label and dropdown
        const provider_label = options_container.createEl("label", {
            text: "Provider",
            cls: "row_items_spacing",
        });
        const provider_select = options_container.createEl("select", {
            cls: "provider_select row_items_spacing",
        });
        const settings: CaretPluginSettings = this.plugin.settings;
        const provider_entries = Object.entries(DEFAULT_SETTINGS.provider_dropdown_options);

        // Ensure the provider select has a default value set from the beginning
        if (provider_entries.length > 0) {
            provider_entries.forEach(([provider_key, provider_name]) => {
                const option = provider_select.createEl("option", { text: provider_name });
                option.value = provider_key;
            });
        }

        // Default to the first provider if prompt.provider is not set
        if (!prompt.provider && provider_entries.length > 0) {
            prompt.provider = provider_entries[0][0];
        }

        // Set the default value after options are added
        provider_select.value = prompt.provider || provider_entries[0][0];

        // Model label and dropdown
        const model_label = options_container.createEl("label", {
            text: "Model",
            cls: "row_items_spacing",
        });
        const model_select = options_container.createEl("select", {
            cls: "model_select row_items_spacing",
        });

        // Function to update model options based on selected provider
        const update_model_options = (provider: string) => {
            if (!provider) {
                return;
            }
            model_select.innerHTML = ""; // Clear existing options
            const models = settings.llm_provider_options[provider];
            Object.entries(models).forEach(([model_key, model_details]) => {
                const option = model_select.createEl("option", { text: model_details.name });
                option.value = model_key;
            });
            // Set the default value after options are added
            model_select.value = prompt.model;
        };

        // Add event listener to provider select to update models dynamically
        provider_select.addEventListener("change", (event) => {
            const selected_provider = (event.target as HTMLSelectElement).value;
            update_model_options(selected_provider);
        });

        // Initialize model options based on the default or current provider
        update_model_options(provider_select.value);
        model_select.value = prompt.model;

        // Temperature label and input
        const temperature_label = options_container.createEl("label", {
            text: "Temperature",
            cls: "row_items_spacing",
        });

        // Temperature input
        const temperature_input = options_container.createEl("input", {
            type: "number",
            cls: "temperature_input",
        }) as HTMLInputElement;

        // Set the attributes separately to avoid TypeScript errors
        temperature_input.min = "0";
        temperature_input.max = "2";
        temperature_input.step = "0.1";
        temperature_input.value = prompt.temperature;

        // Ensure the up and down arrows appear on the input
        temperature_input.style.appearance = "number-input";
        temperature_input.style.webkitAppearance = "number-input";

        // Delay label and input
        const delay_label = options_container.createEl("label", {
            text: "Delay",
            cls: "row_items_spacing",
        });
        const delay_input = options_container.createEl("input", {
            type: "number",
            cls: "delay_input row_items_spacing",
            // @ts-ignore
            min: "0",
            max: "60",
            step: "1",
            value: prompt.delay,
        });

        if (!loading_prompt) {
            this.prompts.push({
                model: provider_select.value,
                provider: provider_select.value,
                delay: delay_input.value,
                temperature: temperature_input.value,
                prompt: text_area.value,
            });
        }

        text_area.id = `text_area_id_${array_index}`;
        provider_select.id = `provider_select_id_${array_index}`;
        model_select.id = `model_select_id_${array_index}`;
        temperature_input.id = `temperature_input_id_${array_index}`;
        delay_input.id = `delay_input_id_${array_index}`;

        text_area.addEventListener("input", () => {
            const text_area_element = this.prompt_container.querySelector(`#text_area_id_${array_index}`);
            if (text_area_element) {
                this.prompts[array_index].prompt = (text_area_element as HTMLInputElement).value;
            }
        });

        provider_select.addEventListener("change", () => {
            const provider_select_element = this.prompt_container.querySelector(`#provider_select_id_${array_index}`);
            if (provider_select_element) {
                this.prompts[array_index].provider = provider_select.value;
                update_model_options(provider_select.value);
            }
        });

        model_select.addEventListener("change", () => {
            const model_select_element = this.prompt_container.querySelector(`#model_select_id_${array_index}`);
            if (model_select_element) {
                this.prompts[array_index].model = model_select.value;
            }
        });

        temperature_input.addEventListener("input", () => {
            const temperature_input_element = this.prompt_container.querySelector(
                `#temperature_input_id_${array_index}`
            );
            if (temperature_input_element) {
                this.prompts[array_index].temperature = temperature_input.value;
            }
        });

        delay_input.addEventListener("input", () => {
            const delay_input_element = this.prompt_container.querySelector(`#delay_input_id_${array_index}`);
            if (delay_input_element) {
                this.prompts[array_index].delay = delay_input.value;
            }
        });
    }
}

export default class CaretPlugin extends Plugin {
    settings: CaretPluginSettings;
    canvas_patched: boolean = false;
    selected_node_colors: any = {};
    color_picker_open_on_last_click: boolean = false;
    openai_client: OpenAI;
    groq_client: Groq;
    anthropic_client: Anthropic;
    openrouter_client: OpenAI;
    encoder: any;

    async onload() {
        // Set up the encoder (gpt-4 is just used for everything as a short term solution)
        this.encoder = encodingForModel("gpt-4-0125-preview");
        // Load settings
        await this.loadSettings();

        // Initialize API clients
        if (this.settings.openai_api_key) {
            this.openai_client = new OpenAI({ apiKey: this.settings.openai_api_key, dangerouslyAllowBrowser: true });
        }
        if (this.settings.groq_api_key) {
            this.groq_client = new Groq({ apiKey: this.settings.groq_api_key, dangerouslyAllowBrowser: true });
        }
        if (this.settings.anthropic_api_key) {
            this.anthropic_client = new Anthropic({
                apiKey: this.settings.anthropic_api_key,
            });
        }
        if (this.settings.open_router_key) {
            this.openrouter_client = new OpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: this.settings.open_router_key,
                dangerouslyAllowBrowser: true,
            });
        }
        // Initialize settings dab.
        this.addSettingTab(new CaretSettingTab(this.app, this));

        // Add Commands.
        this.addCommand({
            id: "add-custom-models",
            name: "Add Custom Models",
            callback: () => {
                new CustomModelModal(this.app, this).open();
            },
        });

        // Utility command use during development
        // this.addCommand({
        //     id: "test-log",
        //     name: "test",
        //     callback: () => {
        //         const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        //         // @ts-ignore
        //         if (!canvas_view?.canvas) {
        //             return;
        //         }
        //         const canvas = (canvas_view as any).canvas; // Assuming canvas is a property of the view

        //         const selection = canvas.selection;
        //         const selection_iterator = selection.values();
        //         const node = selection_iterator.next().value;
        //         if (!node) {
        //             return;
        //         }
        //         return;
        //     },
        // });
        this.addCommand({
            id: "remove-custom-models",
            name: "Remove Custom Models",
            callback: () => {
                new RemoveCustomModelModal(this.app, this).open();
            },
        });
        this.addCommand({
            id: "set-system-prompt",
            name: "Set System Prompt",
            callback: () => {
                new SystemPromptModal(this.app, this).open();
            },
        });
        this.addCommand({
            id: "create-new-workflow",
            name: "Create New Workflow",
            callback: () => {
                const leaf = this.app.workspace.getLeaf(true);
                const linearWorkflowEditor = new LinearWorkflowEditor(this, leaf);
                leaf.open(linearWorkflowEditor);
                this.app.workspace.revealLeaf(leaf);
            },
        });
        this.addCommand({
            id: "create-linear-workflow",
            name: "Create Linear Workflow From Canvas",
            callback: async () => {
                const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
                // @ts-ignore
                if (!canvas_view?.canvas) {
                    return;
                }
                const canvas = (canvas_view as any).canvas; // Assuming canvas is a property of the view

                const selection = canvas.selection;

                const selected_ids = [];
                const selection_iterator = selection.values();
                for (const node of selection_iterator) {
                    selected_ids.push(node.id);
                }

                const canvas_data = canvas.getData();
                const { nodes, edges } = canvas;

                // Filter nodes and edges based on selected IDs
                const selected_nodes = [];
                for (const node of nodes.values()) {
                    if (selected_ids.includes(node.id)) {
                        selected_nodes.push(node);
                    }
                }

                const selected_edges = [];
                for (const edge of edges.values()) {
                    // if (selected_ids.includes(edge.from.node.id) && selected_ids.includes(edge.to.node.id)) {
                    if (selected_ids.includes(edge.to.node.id)) {
                        selected_edges.push(edge);
                    }
                }
                const linear_graph = [];
                for (let i = 0; i < selected_edges.length; i++) {
                    const edge = selected_edges[i];
                    const from_node = edge.from.node.id;
                    const to_node = edge.to.node.id;
                    const node_text = linear_graph.push({ from_node, to_node });
                }
                const from_nodes = new Set(linear_graph.map((edge) => edge.from_node));
                const to_nodes = new Set(linear_graph.map((edge) => edge.to_node));

                let ultimate_ancestor = null;
                let ultimate_child = null;

                // Find the ultimate ancestor (a from_node that is not a to_node)
                for (const from_node of from_nodes) {
                    if (!to_nodes.has(from_node)) {
                        ultimate_ancestor = from_node;
                        break;
                    }
                }

                // Find the ultimate child (a to_node that is not a from_node)
                for (const to_node of to_nodes) {
                    if (!from_nodes.has(to_node)) {
                        ultimate_child = to_node;
                        break;
                    }
                }
                // Create a map for quick lookup of edges by from_node
                const edge_map = new Map();
                for (const edge of linear_graph) {
                    if (!edge_map.has(edge.from_node)) {
                        edge_map.set(edge.from_node, []);
                    }
                    edge_map.get(edge.from_node).push(edge);
                }

                // Initialize the sorted graph with the ultimate ancestor
                const sorted_graph = [];
                let current_node = ultimate_ancestor;

                // Traverse the graph starting from the ultimate ancestor
                while (current_node !== ultimate_child) {
                    const edges_from_current = edge_map.get(current_node);
                    if (edges_from_current && edges_from_current.length > 0) {
                        const next_edge = edges_from_current[0]; // Assuming there's only one edge from each node
                        sorted_graph.push(next_edge);
                        current_node = next_edge.to_node;
                    } else {
                        break; // No further edges, break the loop
                    }
                }

                // Add the ultimate child as the last node
                sorted_graph.push({ from_node: current_node, to_node: ultimate_child });
                // Create a list to hold the ordered node IDs
                const ordered_node_ids = [];

                // Add the ultimate ancestor as the starting node
                ordered_node_ids.push(ultimate_ancestor);

                // Traverse the sorted graph to collect node IDs in order
                for (const edge of sorted_graph) {
                    if (
                        edge.to_node !== ultimate_child ||
                        ordered_node_ids[ordered_node_ids.length - 1] !== ultimate_child
                    ) {
                        ordered_node_ids.push(edge.to_node);
                    }
                }

                // Initialize a new list to hold the prompts
                const prompts = [];

                // Iterate over the ordered node IDs
                for (const node_id of ordered_node_ids) {
                    // Find the corresponding node in selected_nodes
                    const node = selected_nodes.find((n) => n.id === node_id);
                    if (node) {
                        // Get the node context
                        const context = node.text;
                        // Check if the context starts with "user"
                        if (context.startsWith("<role>user</role>")) {
                            // Add the context to the prompts list
                            prompts.push(context.replace("<role>user</role>", "").trim());
                        }
                    }
                }

                const chat_folder_path = "caret/workflows";
                const chat_folder = this.app.vault.getAbstractFileByPath(chat_folder_path);
                if (!chat_folder) {
                    await this.app.vault.createFolder(chat_folder_path);
                }

                let prompts_string = ``;
                for (let i = 0; i < prompts.length; i++) {
                    const escaped_content = this.escapeXml(prompts[i]);
                    prompts_string += `

<prompt model="${this.settings.model}" provider="${this.settings.llm_provider}" delay="0" temperature="1">
${escaped_content}
</prompt>`.trim();
                }

                let file_content = `
---
caret_prompt: linear
version: 1
---
\`\`\`xml
<root>
<system_prompt tag="placeholder_do_not_delete">
</system_prompt>
    ${prompts_string}
</root>
\`\`\`
`.trim();

                let base_file_name = prompts[0]
                    .split(" ")
                    .slice(0, 10)
                    .join(" ")
                    .substring(0, 20)
                    .replace(/[^a-zA-Z0-9]/g, "_");
                let file_name = `${base_file_name}.md`;
                let file_path = `${chat_folder_path}/${file_name}`;
                let file = await this.app.vault.getFileByPath(file_path);
                let counter = 1;

                while (file) {
                    file_name = `${base_file_name}_${counter}.md`;
                    file_path = `${chat_folder_path}/${file_name}`;
                    file = await this.app.vault.getFileByPath(file_path);
                    counter++;
                }

                try {
                    if (file) {
                        await this.app.vault.modify(file, file_content);
                    } else {
                        await this.app.vault.create(file_path, file_content);
                    }
                    // new Notice("Workflow saved!");
                    const leaf = this.app.workspace.getLeaf(true);
                    const linearWorkflowEditor = new LinearWorkflowEditor(this, leaf, file_path);
                    leaf.open(linearWorkflowEditor);
                    this.app.workspace.revealLeaf(leaf);
                } catch (error) {
                    console.error("Failed to save chat:", error);
                }
            },
        });

        this.registerEvent(this.app.workspace.on("layout-change", () => {}));
        const that = this;

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (event) => {
                const currentLeaf = this.app.workspace.activeLeaf;
                this.unhighlight_lineage();

                if (currentLeaf?.view.getViewType() === "canvas") {
                    const canvas = currentLeaf.view;
                    this.patchCanvasMenu();
                }
            })
        );
        this.registerEditorExtension([redBackgroundField]);

        // Register the sidebar icon
        this.addChatIconToRibbon();

        this.addCommand({
            id: "caret-log",
            name: "Log",
            callback: async () => {
                // const currentLeaf = this.app.workspace.activeLeaf;
            },
        });
        this.addCommand({
            id: "insert-note",
            name: "Insert Note",
            callback: async () => {
                const currentLeaf = this.app.workspace.activeLeaf;
                if (!currentLeaf) {
                    new Notice("No active leaf");
                    return;
                }
                const view = currentLeaf.view;
                const view_type = view.getViewType();
                if (view_type !== "main-caret") {
                    new Notice("This command only works in a chat window");
                    return;
                }

                // new InsertNoteModal(this.app, this, view).open();
                new InsertNoteModal(this.app, this, (note: string) => {
                    console.log("Selected note:", note);
                }).open();
            },
        });

        this.addCommand({
            id: "canvas-prompt",
            name: "Canvas Prompt",
            callback: async () => {
                const currentLeaf = this.app.workspace.activeLeaf;
                if (currentLeaf?.view.getViewType() === "canvas") {
                    const canvasView = currentLeaf.view;
                    const canvas = (canvasView as any).canvas;
                    const selection = canvas.selection;

                    let average_x = 0;
                    let average_y = 0;
                    let average_height = 0;
                    let average_width = 0;

                    let total_x = 0;
                    let total_y = 0;
                    let count = 0;
                    let total_height = 0;
                    let total_width = 0;
                    let all_text = "";

                    let convo_total_tokens = 0;

                    const context_window = this.settings.context_window;

                    for (const obj of selection) {
                        const { x, y, height, width } = obj;
                        total_x += x;
                        total_y += y;
                        total_height += height;
                        total_width += width;
                        count++;
                        if ("text" in obj) {
                            const { text } = obj;
                            const text_token_length = this.encoder.encode(text).length;
                            if (convo_total_tokens + text_token_length < context_window) {
                                all_text += text + "\n";
                                convo_total_tokens += text_token_length;
                            } else {
                                new Notice("Context window exceeded - This is the message?");
                                break;
                            }
                        } else if ("filePath" in obj) {
                            let { filePath } = obj;
                            const file = await this.app.vault.getFileByPath(filePath);
                            if (file.extension === "pdf") {
                                const text = await this.extractTextFromPDF(file.name);
                                const text_token_length = this.encoder.encode(text).length;
                                if (convo_total_tokens + text_token_length > context_window) {
                                    new Notice("Context window exceeded");
                                    break;
                                }
                                const file_text = `PDF Title: ${file.name}`;
                                all_text += `${file_text} \n ${text}`;
                                convo_total_tokens += text_token_length;
                            } else if (file?.extension === "md") {
                                const text = await this.app.vault.read(file);
                                const text_token_length = this.encoder.encode(text).length;
                                if (convo_total_tokens + text_token_length > context_window) {
                                    new Notice("Context window exceeded");
                                    break;
                                }
                                const file_text = `
                                Title: ${filePath.replace(".md", "")}
                                ${text}
                                `.trim();
                                all_text += file_text;
                                convo_total_tokens += text_token_length;
                            }
                        }
                    }

                    average_x = count > 0 ? total_x / count : 0;
                    average_y = count > 0 ? total_y / count : 0;
                    average_height = count > 0 ? Math.max(200, total_height / count) : 200;
                    average_width = count > 0 ? Math.max(200, total_width / count) : 200;

                    // This handles the model ---
                    // Create a modal with a text input and a submit button
                    const modal = new Modal(this.app);
                    modal.contentEl.createEl("h1", { text: "Canvas Prompt" });
                    const container = modal.contentEl.createDiv({ cls: "flex-col" });
                    const text_area = container.createEl("textarea", {
                        placeholder: "",
                        cls: "w-full mb-2",
                    });
                    const submit_button = container.createEl("button", { text: "Submit" });
                    submit_button.onclick = async () => {
                        modal.close();
                        const prompt = `
                        Please do the following:
                        ${text_area.value}

                        Given this content:
                        ${all_text}
                        `;
                        const conversation: Message[] = [{ role: "user", content: prompt }];
                        // Create the text node on the canvas
                        const text_node_config = {
                            pos: { x: average_x + 50, y: average_y }, // Position on the canvas
                            size: { width: average_width, height: average_height }, // Size of the text box
                            position: "center", // This might relate to text alignment
                            text: "", // Text content from input
                            save: true, // Save this node's state
                            focus: true, // Focus and start editing immediately
                        };
                        const node = canvas.createTextNode(text_node_config);
                        const node_id = node.id;

                        if (
                            this.settings.llm_provider_options[this.settings.llm_provider][this.settings.model]
                                .streaming
                        ) {
                            const stream: Message = await this.llm_call_streaming(
                                this.settings.llm_provider,
                                this.settings.model,
                                conversation,
                                1
                            );

                            await this.update_node_content(node_id, stream, this.settings.llm_provider);
                        } else {
                            const content = await this.llm_call(
                                this.settings.llm_provider,
                                this.settings.model,
                                conversation
                            );
                            node.setText(content);
                        }
                    };
                    modal.open();
                }
            },
        });

        this.addCommand({
            id: "inline-editing",
            name: "Inline Editing",
            hotkeys: [{ modifiers: ["Mod"], key: "j" }],
            callback: () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.editor) {
                    const selectedText = activeView.editor.getSelection();
                    const content = activeView.editor.getValue();
                    const startIndex = content.indexOf(selectedText);
                    const endIndex = startIndex + selectedText.length;
                    new CMDJModal(this.app, selectedText, startIndex, endIndex, this).open();
                } else {
                    new Notice("No active markdown editor or no text selected.");
                }
            },
        });

        // Register the custom view
        this.registerView(VIEW_NAME_SIDEBAR_CHAT, (leaf) => new SidebarChat(leaf));
        this.registerView(VIEW_NAME_MAIN_CHAT, (leaf) => new FullPageChat(this, leaf));

        this.addCommand({
            id: "continue-chat",
            name: "Continue Chat",
            callback: async () => {
                const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                if (editor) {
                    const active_file = this.app.workspace.getActiveFile();
                    const active_file_name = active_file.name;
                    let content = editor.getValue();

                    const split = content.split("<root>");
                    const first_half = split[1];
                    const second_split = first_half.split("</root>");
                    const text = `<root>${second_split[0].trim()}</root>`;

                    let xml_object;

                    if (text) {
                        xml_object = await this.parseXml(text);
                    } else {
                        new Notice("No XML block found.");
                        return;
                    }
                    const convo_id = xml_object.root.metadata[0].id[0];
                    const messages_from_xml = xml_object.root.conversation[0].message;
                    const messages: Message[] = [];
                    if (messages_from_xml) {
                        for (let i = 0; i < messages_from_xml.length; i++) {
                            const role = messages_from_xml[i].role[0];
                            const content = messages_from_xml[i].content[0];
                            messages.push({ role, content });
                        }
                    }
                    if (convo_id && messages) {
                        const leaf = this.app.workspace.getLeaf(true);
                        const header_el = leaf.tabHeaderEl;
                        if (header_el) {
                            const title_el = header_el.querySelector(".workspace-tab-header-inner-title");
                            if (title_el) {
                                if (active_file_name) {
                                    title_el.textContent = active_file_name;
                                } else {
                                    title_el.textContent = "Caret Chat";
                                }
                            }
                        }
                        const chatView = new FullPageChat(this, leaf, convo_id, messages);
                        leaf.open(chatView);
                        leaf.getDisplayText();
                        this.app.workspace.revealLeaf(leaf);
                    } else {
                        new Notice("No valid chat data found in the current document.");
                    }
                } else {
                    new Notice("No active markdown editor found.");
                }
            },
        });
        this.addCommand({
            id: "edit-workflow",
            name: "Edit Workflow",
            callback: async () => {
                const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                if (editor) {
                    const current_file = this.app.workspace.getActiveFile();
                    const front_matter = await this.get_frontmatter(current_file);

                    if (front_matter.caret_prompt !== "linear") {
                        new Notice("Not a linear workflow");
                    }
                    const leaf = this.app.workspace.getLeaf(true);
                    const linearWorkflowEditor = new LinearWorkflowEditor(this, leaf, current_file?.path);
                    leaf.open(linearWorkflowEditor);
                    this.app.workspace.revealLeaf(leaf);
                    return;
                }
            },
        });

        this.addCommand({
            id: "apply-inline-changes",
            name: "Apply Inline Changes",
            hotkeys: [{ modifiers: ["Mod"], key: "d" }],
            callback: () => {
                const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                if (editor) {
                    let content = editor.getValue();
                    // Regex to find |-content-|
                    const deleteRegex = /\|-(.*?)-\|/gs;
                    // Regex to find |+content+|

                    // Replace all instances of |-content-| with empty string
                    content = content.replace(deleteRegex, "");
                    // Replace all instances of |+content+| with empty string
                    // @ts-ignore
                    content = content.replaceAll("|+", "");
                    // @ts-ignore
                    content = content.replaceAll("+|", "");

                    // Set the modified content back to the editor
                    editor.setValue(content);
                    new Notice("Dips applied successfully.");
                } else {
                    new Notice("No active markdown editor found.");
                }
            },
        });
    }

    // General functions that the plugin uses
    async get_frontmatter(file: any) {
        let front_matter: any;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                front_matter = { ...fm };
            });
        } catch (error) {
            console.error("Error processing front matter:", error);
        }
        return front_matter;
    }

    async highlight_lineage() {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Sleep for 200 milliseconds

        const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvas_view?.canvas) {
            return;
        }
        const canvas = (canvas_view as any).canvas; // Assuming canvas is a property of the view

        const selection = canvas.selection;
        const selection_iterator = selection.values();
        const node = selection_iterator.next().value;
        if (!node) {
            return;
        }
        const nodes_iterator = canvas.nodes.values();
        const nodes_array = Array.from(nodes_iterator);
        const canvas_data = canvas.getData();
        const { edges, nodes } = canvas_data;
        const longest_lineage = await this.getLongestLineage(nodes, edges, node.id);

        // Create a set to track lineage node IDs for comparison
        const lineage_node_ids = new Set(longest_lineage.map((node) => node.id));

        // Iterate through all nodes in the longest lineage
        for (const lineage_node of longest_lineage) {
            const lineage_id = lineage_node.id;
            const lineage_color = lineage_node.color;
            // Only store and change the color if it's not already stored
            if (!this.selected_node_colors.hasOwnProperty(lineage_id)) {
                this.selected_node_colors[lineage_id] = lineage_color; // Store the current color with node's id as key
                const filtered_nodes = nodes_array.filter((node: Node) => node.id === lineage_id);
                filtered_nodes.forEach((node: Node) => {
                    node.color = "4"; // Reset the node color to its original
                    node.render(); // Re-render the node to apply the color change
                });
            }
        }

        // Reset and remove nodes not in the current lineage
        Object.keys(this.selected_node_colors).forEach((node_id) => {
            if (!lineage_node_ids.has(node_id)) {
                const original_color = this.selected_node_colors[node_id];
                const filtered_nodes = nodes_array.filter((node: Node) => node.id === node_id);
                filtered_nodes.forEach((node: Node) => {
                    node.color = original_color; // Reset the node color to its original
                    node.render(); // Re-render the node to apply the color change
                });
                delete this.selected_node_colors[node_id]; // Remove from tracking object
            }
        });
    }
    async getChatLog(folderPath: string, chatId: string) {
        const chatFolder = this.app.vault.getFolderByPath(folderPath);
        if (!chatFolder) {
            await this.app.vault.createFolder(folderPath);
        }
        let fileToSaveTo = null;

        const folder = this.app.vault.getFolderByPath(folderPath);
        let folders_to_check = [folder];
        let num_folders_to_check = 1;
        let num_folders_checked = 0;

        while (num_folders_checked < num_folders_to_check) {
            const folder = folders_to_check[num_folders_checked];
            const children = folder?.children || [];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.hasOwnProperty("extension")) {
                    let contents = await this.app.vault.cachedRead(child);
                    if (!contents) {
                        continue;
                    }
                    contents = contents.toLowerCase();

                    const split_one = contents.split("<id>")[1];
                    const id = split_one.split("</id>")[0];
                    if (id.toLowerCase() === chatId.toLowerCase()) {
                        fileToSaveTo = child;
                    }
                } else {
                    folders_to_check.push(child);
                    num_folders_to_check += 1;
                }
            }

            num_folders_checked += 1;
        }
        return fileToSaveTo;
    }
    escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case "&":
                    return "&amp;";
                case "'":
                    return "&apos;";
                case '"':
                    return "&quot;";
                default:
                    return c;
            }
        });
    }
    async unhighlight_lineage() {
        const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvas_view?.canvas) {
            return;
        }
        const canvas = (canvas_view as any).canvas;
        const nodes_iterator = canvas.nodes.values();
        const nodes_array = Array.from(nodes_iterator);

        for (const node_id in this.selected_node_colors) {
            const filtered_nodes = nodes_array.filter((node: Node) => node.id === node_id);
            filtered_nodes.forEach((node: Node) => {
                node.color = this.selected_node_colors[node_id]; // Reset the node color to its original
                node.render(); // Re-render the node to apply the color change
            });
        }
        this.selected_node_colors = {}; // Clear the stored colors after resetting
    }
    patchCanvasMenu() {
        const canvasView = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvasView?.canvas) {
            return;
        }
        if (!canvasView) {
            return;
        }
        // @ts-ignore
        const canvas = canvasView.canvas;
        const nodes = canvas.nodes;

        for (const node of nodes.values()) {
            if (node.unknownData) {
                if (!node.unknownData.role) {
                    node.unknownData.role = "";
                }
                if (node.unknownData.displayOverride) {
                    node.unknownData.displayOverride = false;
                }
            }
        }

        const menu = canvas.menu;
        if (!menu) {
            console.error("No menu found on the canvas");
            return;
        }
        const that = this; // Capture the correct 'this' context.

        const menuUninstaller = around(menu.constructor.prototype, {
            render: (next: any) =>
                async function (...args: any) {
                    const result = await next.call(this, ...args);

                    that.add_new_node_button(this.menuEl);

                    that.add_sparkle_button(this.menuEl);
                    that.add_extra_actions(this.menuEl);

                    // await that.add_agent_button(this.menuEl);

                    return result;
                },
        });
        this.register(menuUninstaller);
        // if (!this.canvas_patched) {
        // Define the functions to be patched
        const functions = {
            onDoubleClick: (next: any) =>
                function (event: MouseEvent) {
                    next.call(this, event);
                },
            onPointerdown: (next: any) =>
                function (event: MouseEvent) {
                    if (event.target) {
                        // @ts-ignore
                        const isNode = event.target.closest(".canvas-node");
                        const canvas_color_picker_item = document.querySelector(
                            '.clickable-icon button[aria-label="Set Color"]'
                        );

                        if (isNode) {
                            that.highlight_lineage();
                        } else {
                            that.unhighlight_lineage();
                        }
                    } else {
                        that.unhighlight_lineage();
                    }

                    next.call(this, event);
                },

            requestFrame: (next: any) =>
                function (...args: any) {
                    const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
                    // @ts-ignore
                    if (!canvas_view?.canvas) {
                        return;
                    }
                    const canvas = (canvas_view as any).canvas; // Assuming canvas is a property of the view
                    const nodes = canvas.nodes;

                    for (const node of nodes.values()) {
                        if (node.unknownData) {
                            if (!node.unknownData.role) {
                                node.unknownData.role = "";
                            }
                            if (!node.unknownData.displayOverride) {
                                node.unknownData.displayOverride = false;
                            }
                        }
                        const contentEl = node.contentEl;
                        if (contentEl) {
                            const targetDiv = contentEl.querySelector(".markdown-embed-content.node-insert-event");
                            if (targetDiv) {
                                let customDisplayDiv = contentEl.querySelector("#custom-display");
                                if (node.unknownData.role.length > 0) {
                                    if (!customDisplayDiv) {
                                        customDisplayDiv = document.createElement("div");
                                        customDisplayDiv.id = "custom-display";
                                        customDisplayDiv.style.width = "100%";
                                        customDisplayDiv.style.height = "40px";
                                        customDisplayDiv.style.backgroundColor = "rgba(211, 211, 211, 0.8)";
                                        customDisplayDiv.style.padding = "2px";
                                        customDisplayDiv.style.paddingLeft = "8px";
                                        customDisplayDiv.style.paddingTop = "4px";
                                        targetDiv.parentNode.insertBefore(customDisplayDiv, targetDiv);
                                    }

                                    if (node.unknownData.role === "assistant") {
                                        customDisplayDiv.textContent = "🤖";
                                    } else if (node.unknownData.role === "user") {
                                        customDisplayDiv.textContent = "👤";
                                    } else if (node.unknownData.role === "system") {
                                        customDisplayDiv.textContent = "🖥️";
                                    }
                                }

                                node.unknownData.displayOverride = true;
                            }
                        }
                    }

                    const result = next.call(this, ...args);
                    return result;
                },
        };
        const doubleClickPatcher = around(canvas.constructor.prototype, functions);
        this.register(doubleClickPatcher);

        canvasView.scope?.register(["Mod", "Shift"], "ArrowUp", () => {
            that.create_directional_node(canvas, "top");
        });

        canvasView.scope?.register(["Mod"], "ArrowUp", () => {
            that.navigate(canvas, "top");
        });
        canvasView.scope?.register(["Mod"], "ArrowDown", () => {
            that.navigate(canvas, "bottom");
        });
        canvasView.scope?.register(["Mod"], "ArrowLeft", () => {
            that.navigate(canvas, "left");
        });
        canvasView.scope?.register(["Mod"], "ArrowRight", () => {
            that.navigate(canvas, "right");
        });
        canvasView.scope?.register(["Mod"], "Enter", () => {
            that.start_editing_node(canvas);
        });

        canvasView.scope?.register(["Mod", "Shift"], "ArrowUp", () => {
            that.create_directional_node(canvas, "top");
        });
        canvasView.scope?.register(["Mod", "Shift"], "ArrowDown", () => {
            that.create_directional_node(canvas, "bottom");
        });
        canvasView.scope?.register(["Mod", "Shift"], "ArrowLeft", () => {
            that.create_directional_node(canvas, "left");
        });
        canvasView.scope?.register(["Mod", "Shift"], "ArrowRight", () => {
            that.create_directional_node(canvas, "right");
        });
        canvasView.scope?.register(["Mod", "Shift"], "Enter", () => {
            that.run_graph_chat(canvas);
        });

        if (!this.canvas_patched) {
            // @ts-ignore
            canvasView.leaf.rebuildView();
            this.canvas_patched = true;
        }
    }
    create_directional_node(canvas: any, direction: string) {
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        if (!node) {
            return;
        }
        if (node.isEditing) {
            return;
        }
        const parent_node_x = node.x;
        const parent_node_y = node.y;
        const parent_width = node.width;
        const parent_height = node.height;

        let x: number;
        let y: number;
        let from_side: string;
        let to_side: string;

        switch (direction) {
            case "left":
                x = parent_node_x - parent_width - 200;
                y = parent_node_y;
                from_side = "left";
                to_side = "right";
                break;
            case "right":
                x = parent_node_x + parent_width + 200;
                y = parent_node_y;
                from_side = "right";
                to_side = "left";
                break;
            case "top":
                x = parent_node_x;
                y = parent_node_y - parent_height - 200;
                from_side = "top";
                to_side = "bottom";
                break;
            case "bottom":
                x = parent_node_x;
                y = parent_node_y + parent_height + 200;
                from_side = "bottom";
                to_side = "top";
                break;
            default:
                console.error("Invalid direction provided");
                return;
        }

        this.createChildNode(canvas, node, x, y, "", from_side, to_side);
    }
    start_editing_node(canvas: Canvas) {
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        const node_id = node.id;
        node.isEditing = true;
        const editButton = document.querySelector('.canvas-menu button[aria-label="Edit"]') as HTMLElement;
        if (editButton) {
            editButton.click(); // Simulate the click on the edit button
        } else {
            console.error("Edit button not found");
        }
    }
    run_graph_chat(canvas: Canvas) {
        canvas.requestSave();
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        const node_id = node.id;

        const editButton = document.querySelector('.canvas-menu button[aria-label="Sparkle"]') as HTMLButtonElement;
        if (editButton) {
            setTimeout(() => {
                editButton.click(); // Simulate the click on the edit button after 200 milliseconds
            }, 200);
        } else {
            console.error("Edit button not found");
        }
    }
    navigate(canvas: Canvas, direction: string) {
        // const canvas = canvasView.canvas;
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        if (!node) {
            return;
        }
        if (node.isEditing) {
            return;
        }
        const node_id = node.id;
        const canvas_data = canvas.getData();

        // Assuming direction can be 'next' or 'previous' for simplicity
        const edges = canvas_data.edges;
        const nodes = canvas_data.nodes;
        let targetNodeID: string | null = null;

        switch (direction) {
            case "right":
                // Handle both 'from' and 'to' cases for 'right'
                const edgeRightFrom = edges.find(
                    (edge: Edge) => edge.fromNode === node_id && edge.fromSide === "right"
                );
                if (edgeRightFrom) {
                    targetNodeID = edgeRightFrom.toNode;
                } else {
                    const edgeRightTo = edges.find((edge: Edge) => edge.toNode === node_id && edge.toSide === "right");
                    if (edgeRightTo) {
                        targetNodeID = edgeRightTo.fromNode;
                    }
                }
                break;
            case "left":
                // Handle both 'from' and 'to' cases for 'left'
                const edgeLeftFrom = edges.find((edge: Edge) => edge.fromNode === node_id && edge.fromSide === "left");
                if (edgeLeftFrom) {
                    targetNodeID = edgeLeftFrom.toNode;
                } else {
                    const edgeLeftTo = edges.find((edge: Edge) => edge.toNode === node_id && edge.toSide === "left");
                    if (edgeLeftTo) {
                        targetNodeID = edgeLeftTo.fromNode;
                    }
                }
                break;
            case "top":
                // Handle both 'from' and 'to' cases for 'top'
                const edgeTopFrom = edges.find((edge: Edge) => edge.fromNode === node_id && edge.fromSide === "top");
                if (edgeTopFrom) {
                    targetNodeID = edgeTopFrom.toNode;
                } else {
                    const edgeTopTo = edges.find((edge: Edge) => edge.toNode === node_id && edge.toSide === "top");
                    if (edgeTopTo) {
                        targetNodeID = edgeTopTo.fromNode;
                    }
                }
                break;
            case "bottom":
                // Handle both 'from' and 'to' cases for 'bottom'
                const edgeBottomFrom = edges.find(
                    (edge: Edge) => edge.fromNode === node_id && edge.fromSide === "bottom"
                );
                if (edgeBottomFrom) {
                    targetNodeID = edgeBottomFrom.toNode;
                } else {
                    const edgeBottomTo = edges.find(
                        (edge: Edge) => edge.toNode === node_id && edge.toSide === "bottom"
                    );
                    if (edgeBottomTo) {
                        targetNodeID = edgeBottomTo.fromNode;
                    }
                }
                break;
        }
        // const viewportNodes = canvas.getViewportNodes();
        let viewport_nodes: ViewportNode[] = [];
        let initial_viewport_children = canvas.nodeIndex.data.children;
        if (initial_viewport_children.length > 1) {
            let type_nodes = "nodes";

            // If there is more childen then use this path.
            if (initial_viewport_children[0] && "children" in initial_viewport_children[0]) {
                type_nodes = "children";
            }
            if (type_nodes === "children") {
                for (let i = 0; i < initial_viewport_children.length; i++) {
                    const nodes_list = initial_viewport_children[i].children;

                    nodes_list.forEach((node: ViewportNode) => {
                        viewport_nodes.push(node);
                    });
                }
            }
            if (type_nodes === "nodes") {
                for (let i = 0; i < initial_viewport_children.length; i++) {
                    const viewport_node = initial_viewport_children[i];
                    viewport_nodes.push(viewport_node);
                }
            }
        }

        if (targetNodeID) {
            const target_node = viewport_nodes.find((node) => node.id === targetNodeID);

            canvas.selectOnly(target_node);
            canvas.zoomToSelection(target_node);
        }
        this.highlight_lineage();
    }
    // async get_viewport_node(node_id: string): Promise<ViewportNode | undefined> {
    //     const canvas_view = await this.get_current_canvas_view();
    //     // @ts-ignore
    //     const canvas = canvas_view.canvas;
    //     let viewport_nodes: ViewportNode[] = [];
    //     let initial_viewport_children = canvas.nodeIndex.data.children;
    //     if (initial_viewport_children.length > 1) {
    //         let type_nodes = "nodes";

    //         // If there is more childen then use this path.
    //         if (initial_viewport_children[0] && "children" in initial_viewport_children[0]) {
    //             type_nodes = "children";
    //         }
    //         if (type_nodes === "children") {
    //             for (let i = 0; i < initial_viewport_children.length; i++) {
    //                 const nodes_list = initial_viewport_children[i].children;

    //                 nodes_list.forEach((node: ViewportNode) => {
    //                     viewport_nodes.push(node);
    //                 });
    //             }
    //         }
    //         if (type_nodes === "nodes") {
    //             for (let i = 0; i < initial_viewport_children.length; i++) {
    //                 const viewport_node = initial_viewport_children[i];
    //                 viewport_nodes.push(viewport_node);
    //             }
    //         }
    //     }
    // }
    async parseXml(xmlString: string): Promise<any> {
        try {
            const result = await new Promise((resolve, reject) => {
                parseString(xmlString, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            console.dir(result);
            return result;
        } catch (err) {
            console.error(err);
        }
    }

    parseCustomXML(xmlString: string, tags: string[]) {
        // Function to extract content between tags
        function getContent(tag: string, string: string) {
            const openTag = `<${tag}>`;
            const closeTag = `</${tag}>`;
            const start = string.indexOf(openTag) + openTag.length;
            const end = string.indexOf(closeTag);
            const prompt_content = string.substring(start, end).trim();
            return prompt_content;
        }

        // Initialize the result object
        const result: any = {};

        // Extract content for each tag provided
        tags.forEach((tag: string) => {
            const content = getContent(tag, xmlString);
            result[tag] = content;
        });

        return result;
    }
    async extractTextFromPDF(file_name: string): Promise<string> {
        // TODO - Clean this up later
        // @ts-ignore
        const file_path = await this.app.vault.getResourcePath({
            path: file_name,
        });
        async function loadAndExtractText(file_path: string): Promise<string> {
            try {
                const doc = await pdfjs.getDocument(file_path).promise;
                const numPages = doc.numPages;

                // Load metadata
                const metadata = await doc.getMetadata();

                let fullText = "";
                for (let i = 1; i <= numPages; i++) {
                    const page = await doc.getPage(i);
                    const viewport = page.getViewport({ scale: 1.0 });

                    const content = await page.getTextContent();
                    const pageText = content.items.map((item: { str: string }) => item.str).join(" ");
                    fullText += pageText + " ";

                    // Release page resources.
                    page.cleanup();
                }
                return fullText;
            } catch (err) {
                console.error("Error: " + err);
                throw err;
            }
        }

        const fullDocumentText = await loadAndExtractText(file_path);
        return fullDocumentText;
    }
    add_new_node_button(menuEl: HTMLElement) {
        if (!menuEl.querySelector(".graph-menu-item")) {
            const graphButtonEl = createEl("button", "clickable-icon graph-menu-item");
            setTooltip(graphButtonEl, "Create User Message", { placement: "top" });
            setIcon(graphButtonEl, "lucide-workflow");
            graphButtonEl.addEventListener("click", async () => {
                // Assuming canvasView is accessible here, or you need to pass it similarly
                const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
                const view = this.app.workspace.getMostRecentLeaf()?.view;
                // @ts-ignore
                if (!view?.canvas) {
                    return;
                }
                // @ts-ignore
                const canvas = view.canvas;
                const selection = canvas.selection;
                const selectionIterator = selection.values();
                const node = selectionIterator.next().value;
                const x = node.x + node.width + 200;
                const new_node = await this.createChildNode(canvas, node, x, node.y, "");
                new_node.unknownData.role = "user";
            });
            menuEl.appendChild(graphButtonEl);
        }
    }
    add_extra_actions(menuEl: HTMLElement) {
        if (!menuEl.querySelector(".wand")) {
            const graphButtonEl = createEl("button", "clickable-icon wand");
            setTooltip(graphButtonEl, "Actions", { placement: "top" });
            setIcon(graphButtonEl, "lucide-wand");

            interface SubmenuItemConfig {
                name: string;
                icon: string;
                tooltip: string;
                callback: () => void;
            }

            function createSubmenu(configs: SubmenuItemConfig[]): HTMLElement {
                const submenuEl = createEl("div", { cls: "submenu" });

                configs.forEach((config) => {
                    const submenuItem = createEl("div", { cls: "submenu-item" });
                    const iconEl = createEl("span", { cls: "clickable-icon" });
                    setIcon(iconEl, config.icon);
                    setTooltip(iconEl, config.tooltip, { placement: "top" });
                    submenuItem.appendChild(iconEl);
                    submenuItem.addEventListener("click", config.callback);
                    submenuEl.appendChild(submenuItem);
                });

                return submenuEl;
            }
            const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
            const view = this.app.workspace.getMostRecentLeaf()?.view;
            // @ts-ignore
            if (!view?.canvas) {
                return;
            }
            // @ts-ignore
            const canvas = view.canvas;
            const selection = canvas.selection;
            const selectionIterator = selection.values();
            const node = selectionIterator.next().value;

            const submenuConfigs: SubmenuItemConfig[] = [
                {
                    name: "User",
                    icon: "lucide-user",
                    tooltip: "Set role to user",
                    callback: () => {
                        node.unknownData.role = "user";
                        node.unknownData.displayOverride = false;
                        canvas.requestFrame();
                    },
                },
                {
                    name: "Assistant",
                    icon: "lucide-bot",
                    tooltip: "Set role to assistant",
                    callback: () => {
                        node.unknownData.role = "assistant";
                        node.unknownData.displayOverride = false;
                        canvas.requestFrame();
                    },
                },
                {
                    name: "System Prompt",
                    icon: "lucide-monitor-check",
                    tooltip: "Set system prompt",
                    callback: () => {
                        node.unknownData.role = "system";
                        node.unknownData.displayOverride = false;
                        canvas.requestFrame();
                    },
                },
            ];

            const submenuEl = createSubmenu(submenuConfigs);

            // Append the submenu to the main button
            graphButtonEl.appendChild(submenuEl);

            let submenuVisible = false;

            graphButtonEl.addEventListener("click", () => {
                submenuVisible = !submenuVisible;
                submenuEl.style.display = submenuVisible ? "grid" : "none";
            });

            menuEl.appendChild(graphButtonEl);
        }
    }

    get_ancestors(nodes: Node[], edges: Edge[], nodeId: string): Node[] {
        let ancestors: Node[] = [];
        let currentId: string = nodeId;
        let processedNodes: Set<string> = new Set();

        while (true) {
            const incomingEdges: Edge[] = edges.filter((edge) => edge.toNode === currentId);
            if (incomingEdges.length === 0) {
                break; // No more ancestors
            }

            currentId = incomingEdges[0].fromNode;
            if (processedNodes.has(currentId)) {
                break; // Avoid infinite loops in cyclic graphs
            }
            processedNodes.add(currentId);

            const ancestor: Node | undefined = nodes.find((node) => node.id === currentId);
            if (ancestor) {
                ancestors.push(ancestor);
            }
        }

        return ancestors;
    }
    getAllAncestorNodes(nodes: Node[], edges: Edge[], nodeId: string): Node[] {
        let ancestors: Node[] = [];
        let queue: string[] = [nodeId];
        let processedNodes: Set<string> = new Set();

        while (queue.length > 0) {
            let currentId = queue.shift();
            if (!currentId || processedNodes.has(currentId)) continue;

            processedNodes.add(currentId);
            const incomingEdges: Edge[] = edges.filter((edge) => edge.toNode === currentId);
            incomingEdges.forEach((edge) => {
                const ancestor = nodes.find((node) => node.id === edge.fromNode);
                if (ancestor && !processedNodes.has(ancestor.id)) {
                    ancestors.push(ancestor);
                    queue.push(ancestor.id);
                }
            });
        }

        return ancestors;
    }
    getLongestLineage(nodes: Node[], edges: Edge[], nodeId: string): Node[] {
        let longestLineage: Node[] = [];

        function findLongestPath(currentId: string, path: Node[]): void {
            const incomingEdges: Edge[] = edges.filter((edge) => edge.toNode === currentId);
            if (incomingEdges.length === 0) {
                // Check if the current path is the longest we've encountered
                if (path.length > longestLineage.length) {
                    longestLineage = path.slice();
                }
                return;
            }

            incomingEdges.forEach((edge) => {
                const ancestor = nodes.find((node) => node.id === edge.fromNode);
                if (ancestor) {
                    // Check if the ancestor is the direct ancestor (index 1) and has 'context' in its content
                    if (path.length === 1 && ancestor.type === "text" && ancestor.text.includes("<context>")) {
                        return; // Skip this lineage
                    }
                    findLongestPath(ancestor.id, path.concat(ancestor));
                }
            });
        }

        // Start with the given node
        const startNode = nodes.find((node) => node.id === nodeId);
        if (startNode) {
            findLongestPath(nodeId, [startNode]);
        }

        return longestLineage;
    }
    async getDirectAncestorsWithContext(nodes: Node[], edges: Edge[], nodeId: string): Promise<string> {
        let direct_ancentors_context = "";

        const startNode = nodes.find((node) => node.id === nodeId);
        if (!startNode) return "";

        const incomingEdges: Edge[] = edges.filter((edge) => edge.toNode === nodeId);
        for (let i = 0; i < incomingEdges.length; i++) {
            const edge = incomingEdges[i];
            const ancestor = nodes.find((node) => node.id === edge.fromNode);
            if (ancestor && ancestor.type === "text" && ancestor.text.includes("<context>")) {
                direct_ancentors_context += ancestor.text + "\n";
            } else if (ancestor && ancestor.type === "file" && ancestor.file && ancestor.file.includes(".md")) {
                const file_path = ancestor.file;
                const file = this.app.vault.getFileByPath(file_path);
                if (file) {
                    const context = await this.app.vault.cachedRead(file);
                    direct_ancentors_context += "\n" + context;
                } else {
                    console.error("File not found:", file_path);
                }
            }
        }
        return direct_ancentors_context;
    }
    async getAllAncestorsWithContext(nodes: Node[], edges: Edge[], nodeId: string): Promise<string> {
        let ancestors_context = "";
        let convo_total_tokens = 0;
        const bracket_regex = /\[\[(.*?)\]\]/g;

        const findAncestorsWithContext = async (nodeId: string) => {
            const node = nodes.find((node) => node.id === nodeId);
            if (!node) return;

            const incomingEdges: Edge[] = edges.filter((edge) => edge.toNode === nodeId);
            for (let i = 0; i < incomingEdges.length; i++) {
                const edge = incomingEdges[i];
                const ancestor = nodes.find((node) => node.id === edge.fromNode);
                if (ancestor) {
                    let contextToAdd = "";

                    if (ancestor.type === "text") {
                        const role = ancestor.role;
                        if (role.length === 0) {
                            let ancestor_text = ancestor.text;
                            const block_ref_content = await this.get_ref_blocks_content(ancestor_text);
                            ancestor_text += block_ref_content;
                            contextToAdd += ancestor_text;
                        }
                    } else if (ancestor.type === "file" && ancestor.file && ancestor.file.includes(".md")) {
                        const file_path = ancestor.file;
                        const file = this.app.vault.getFileByPath(file_path);
                        if (file) {
                            const context = await this.app.vault.cachedRead(file);

                            if (!context.includes("caret_prompt")) {
                                contextToAdd = `\n\n---------------------------\n\nFile Title: ${file_path}\n${context}`;
                            }
                        } else {
                            console.error("File not found:", file_path);
                        }
                    } else if (ancestor.type === "file" && ancestor.file && ancestor.file.includes(".pdf")) {
                        const file_name = ancestor.file;
                        const text = await this.extractTextFromPDF(file_name);
                        contextToAdd = `\n\n---------------------------\n\nPDF File Title: ${file_name}\n${text}`;
                    }

                    const contextTokens = this.encoder.encode(contextToAdd).length;
                    if (convo_total_tokens + contextTokens > this.settings.context_window) {
                        new Notice(
                            "Exceeding context window while adding ancestor context. Stopping further additions."
                        );
                        return;
                    }

                    ancestors_context += contextToAdd;
                    convo_total_tokens += contextTokens;

                    await findAncestorsWithContext(ancestor.id);
                }
            }
        };

        await findAncestorsWithContext(nodeId);
        return ancestors_context;
    }

    async get_ref_blocks_content(node_text: any): Promise<string> {
        const bracket_regex = /\[\[(.*?)\]\]/g;
        let rep_block_content = "";

        let match;
        const matches = [];

        while ((match = bracket_regex.exec(node_text)) !== null) {
            matches.push(match);
        }
        for (const match of matches) {
            let file_path = match[1];
            if (!file_path.includes(".")) {
                file_path += ".md";
            }
            let file = await this.app.vault.getFileByPath(file_path);

            if (!file) {
                const files = this.app.vault.getFiles();
                let matchedFile = files.find((file) => file.name === file_path);
                if (matchedFile) {
                    file = matchedFile;
                }
            }
            if (file && file_path.includes(".md")) {
                const file_content = await this.app.vault.cachedRead(file);
                rep_block_content += file_content; // Update modified_content instead of message.content
            } else if (file && file_path.includes(".pdf")) {
                const pdf_content = await this.extractTextFromPDF(file_path);
                rep_block_content += `PDF File Name: ${file_path}\n ${pdf_content}`;
            } else {
                new Notice(`File not found: ${file_path}`);
            }
        }

        return rep_block_content;
    }
    async get_current_node(canvas: Canvas, node_id: string) {
        await canvas.requestSave(true);
        const nodes_iterator = canvas.nodes.values();
        let node = null;
        for (const node_obj of nodes_iterator) {
            if (node_obj.id === node_id) {
                node = node_obj;
                break;
            }
        }
        return node;
    }
    async get_current_canvas_view() {
        const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvas_view || !canvas_view.canvas) {
            return;
        }
        // @ts-ignore
        const canvas = canvas_view.canvas;
        return canvas_view;
    }

    async sparkle(
        node_id: string,
        system_prompt: string = "",
        sparkle_config: SparkleConfig = {
            model: "default",
            provider: "default",
            temperature: 1,
        }
    ) {
        let local_system_prompt = system_prompt;
        const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvas_view || !canvas_view.canvas) {
            return;
        }
        // @ts-ignore
        const canvas = canvas_view.canvas;

        let node = await this.get_current_node(canvas, node_id);
        if (!node) {
            console.error("Node not found with ID:", node_id);
            return;
        }
        node.unknownData.role = "user";

        // Add user xml if it's not there and re-fetch the node
        let current_text = node.text;
        // Check for text in double brackets and log the match

        const ref_blocks_content = await this.get_ref_blocks_content(node.text);
        current_text += ref_blocks_content;

        const canvas_data = canvas.getData();
        const { edges, nodes } = canvas_data;

        // Continue with operations on `target_node`
        if (node.hasOwnProperty("file")) {
            const file_path = node.file.path;
            const file = this.app.vault.getAbstractFileByPath(file_path);
            if (file) {
                // @ts-ignore
                const text = await this.app.vault.cachedRead(file);

                // Check for the presence of three dashes indicating the start of the front matter
                const front_matter = await this.get_frontmatter(file);
                if (front_matter.hasOwnProperty("caret_prompt")) {
                    let caret_prompt = front_matter.caret_prompt;

                    if (caret_prompt === "parallel" && text) {
                        const xml_content = text.match(/```xml([\s\S]*?)```/)[1].trim();
                        const xml = await this.parseXml(xml_content);
                        const system_prompt_list = xml.root.system_prompt;

                        const system_prompt = system_prompt_list[0]._.trim();

                        const prompts = xml.root.prompt;
                        const card_height = node.height;
                        const middle_index = Math.floor(prompts.length / 2);
                        const highest_y = node.y - middle_index * (100 + card_height); // Calculate the highest y based on the middle index
                        const sparkle_promises = [];

                        for (let i = 0; i < prompts.length; i++) {
                            const prompt = prompts[i];

                            const prompt_content = prompt._.trim();
                            const prompt_delay = prompt.$?.delay || 0;
                            const prompt_model = prompt.$?.model || "default";
                            const prompt_provider = prompt.$?.provider || "default";
                            const prompt_temperature = parseFloat(prompt.$?.temperature) || this.settings.temperature;
                            const new_node_content = `${prompt_content}`;
                            const x = node.x + node.width + 200;
                            const y = highest_y + i * (100 + card_height); // Increment y for each prompt to distribute them vertically including card height

                            // Create a new user node
                            const user_node = await this.createChildNode(
                                canvas,
                                node,
                                x,
                                y,
                                new_node_content,
                                "right",
                                "left"
                            );
                            user_node.unknownData.role = "user";
                            user_node.unknownData.displayOverride = false;

                            const sparkle_config: SparkleConfig = {
                                model: prompt_model,
                                provider: prompt_provider,
                                temperature: prompt_temperature,
                            };

                            const sparkle_promise = (async () => {
                                if (prompt_delay > 0) {
                                    new Notice(`Waiting for ${prompt_delay} seconds...`);
                                    await new Promise((resolve) => setTimeout(resolve, prompt_delay * 1000));
                                    new Notice(`Done waiting for ${prompt_delay} seconds.`);
                                }
                                await this.sparkle(user_node.id, system_prompt, sparkle_config);
                            })();

                            sparkle_promises.push(sparkle_promise);
                        }

                        await Promise.all(sparkle_promises);
                        return;
                    } else if (caret_prompt === "linear") {
                        const xml_content = text.match(/```xml([\s\S]*?)```/)[1].trim();
                        const xml = await this.parseXml(xml_content);
                        const system_prompt_list = xml.root.system_prompt;

                        const system_prompt = system_prompt_list[0]._.trim();

                        const prompts = xml.root.prompt;

                        let current_node = node;
                        for (let i = 0; i < prompts.length; i++) {
                            const prompt = prompts[i];
                            const prompt_content = prompt._.trim();
                            const prompt_delay = prompt.$?.delay || 0;
                            const prompt_model = prompt.$?.model || "default";
                            const prompt_provider = prompt.$?.provider || "default";
                            const prompt_temperature = parseFloat(prompt.$?.temperature) || this.settings.temperature;
                            const new_node_content = `${prompt_content}`;
                            const x = current_node.x + current_node.width + 200;
                            const y = current_node.y;

                            // Create a new user node
                            const user_node = await this.createChildNode(
                                canvas,
                                current_node,
                                x,
                                y,
                                new_node_content,
                                "right",
                                "left"
                            );
                            user_node.unknownData.role = "user";
                            user_node.unknownData.displayOverride = false;
                            const sparkle_config: SparkleConfig = {
                                model: prompt_model,
                                provider: prompt_provider,
                                temperature: prompt_temperature,
                            };
                            if (prompt_delay > 0) {
                                new Notice(`Waiting for ${prompt_delay} seconds...`);
                                await new Promise((resolve) => setTimeout(resolve, prompt_delay * 1000));
                                new Notice(`Done waiting for ${prompt_delay} seconds.`);
                            }
                            const assistant_node = await this.sparkle(user_node.id, system_prompt, sparkle_config);
                            current_node = assistant_node;
                        }
                    } else {
                        new Notice("Invalid Caret Prompt");
                    }

                    return;
                }
            } else {
                console.error("File not found or is not a readable file:", file_path);
            }
        }
        const longest_lineage = this.getLongestLineage(nodes, edges, node.id);
        const ancestors_with_context = await this.getAllAncestorsWithContext(nodes, edges, node.id);

        // TODO - Improve how context gets added
        let added_context = ``;

        added_context += "\n" + ancestors_with_context;
        added_context = added_context.trim();

        let convo_total_tokens = this.encoder.encode(added_context).length;
        const current_message_content = `
${current_text}

Please complete my above request using the below additional content:

${added_context}`;

        const current_message = { role: "user", content: current_message_content };
        let conversation = [current_message];

        for (let i = 1; i < longest_lineage.length; i++) {
            const node = longest_lineage[i];
            let role = node.role || "";
            if (role === "user") {
                let content = node.text;
                // Only for the first node
                const block_ref_content = await this.get_ref_blocks_content(content);
                content += `Referenced content:\n${block_ref_content}`;
                if (content && content.length > 0) {
                    const user_message_tokens = this.encoder.encode(content).length;
                    if (user_message_tokens + convo_total_tokens > this.settings.context_window) {
                        new Notice("Exceeding context window while adding user message. Trimming content");
                        break;
                    }
                    const message = {
                        role,
                        content,
                    };
                    if (message.content.length > 0) {
                        conversation.push(message);
                        convo_total_tokens += user_message_tokens;
                    }
                }
            } else if (role === "assistant") {
                const content = node.text;
                const message = {
                    role,
                    content,
                };
                conversation.push(message);
            } else if (role === "system") {
                local_system_prompt = node.text;
            }
        }
        conversation.reverse();
        if (local_system_prompt.length > 0) {
            conversation.unshift({ role: "system", content: local_system_prompt });
        }
        let model = this.settings.model;
        let provider = this.settings.llm_provider;
        let temperature = this.settings.temperature;
        if (sparkle_config.model !== "default") {
            model = sparkle_config.model;
        }
        if (sparkle_config.provider !== "default") {
            provider = sparkle_config.provider;
        }
        if (sparkle_config.temperature !== this.settings.temperature) {
            temperature = sparkle_config.temperature;
        }
        const node_content = ``;
        const x = node.x + node.width + 200;
        const new_node = await this.createChildNode(canvas, node, x, node.y, node_content, "right", "left", "groq");
        if (!new_node) {
            throw new Error("Invalid new node");
        }
        const new_node_id = new_node.id;
        if (!new_node_id) {
            throw new Error("Invalid node id");
        }
        const new_canvas_node = await this.get_node_by_id(canvas, new_node_id);

        if (!new_canvas_node.unknownData.hasOwnProperty("role")) {
            new_canvas_node.unknownData.role = "";
            new_canvas_node.unknownData.displayOverride = false;
        }
        new_canvas_node.unknownData.role = "assistant";

        if (this.settings.llm_provider_options[provider][model].streaming) {
            const stream = await this.llm_call_streaming(provider, model, conversation, temperature);
            await this.update_node_content(new_node_id, stream, provider);
            return new_node;
        } else {
            const content = await this.llm_call(this.settings.llm_provider, this.settings.model, conversation);
            new_node.setText(content);
        }
    }
    async update_node_content(node_id: string, stream: any, llm_provider: string) {
        const canvas_view = this.app.workspace.getMostRecentLeaf()?.view;
        // @ts-ignore
        if (!canvas_view?.canvas) {
            return;
        }
        const canvas: Canvas = (canvas_view as any).canvas; // Assuming canvas is a property of the view
        const canvas_data = canvas.getData();
        const nodes_iterator = canvas.nodes.values();
        let node = null;
        for (const node_objs of nodes_iterator) {
            if (node_objs.id === node_id) {
                node = node_objs;
                break;
            }
        }
        node.width = 510;

        if (
            llm_provider === "openai" ||
            llm_provider === "groq" ||
            llm_provider === "custom" ||
            llm_provider === "openrouter"
        ) {
            for await (const part of stream) {
                const delta_content = part.choices[0]?.delta.content || "";

                const current_text = node.text;
                const new_content = `${current_text}${delta_content}`;
                const word_count = new_content.split(/\s+/).length;
                const number_of_lines = Math.ceil(word_count / 7);
                if (word_count > 500) {
                    node.width = 750;
                    node.height = Math.max(200, number_of_lines * 35);
                } else {
                    node.height = Math.max(200, number_of_lines * 45);
                }

                node.setText(new_content);
                node.render();
            }
        }
        if (llm_provider === "ollama") {
            for await (const part of stream) {
                const current_text = node.text;
                const new_content = `${current_text}${part.message.content}`;
                const word_count = new_content.split(/\s+/).length;
                const number_of_lines = Math.ceil(word_count / 7);
                if (word_count > 500) {
                    const width = 750;
                    const height = Math.max(200, number_of_lines * 35);
                    // TODO - Try out node.resize() to see if that solves the visual bug.
                    node.height = height;
                    // node.resize(width);
                } else {
                    node.height = Math.max(200, number_of_lines * 45);
                }
                node.setText(new_content);
                node.render();
                node.moveTo();
            }
        }
    }

    async llm_call(provider: string, model: string, conversation: any[]): Promise<string> {
        if (provider === "ollama") {
            let model_param = model;
            new Notice("Calling ollama");
            try {
                const response = await ollama.chat({
                    model: model_param,
                    messages: conversation,
                });
                new Notice("Message back from ollama");
                return response.message.content;
            } catch (error) {
                console.error(error);
                if (error.message) {
                    new Notice(error.message);
                }
                throw error;
            }
        } else if (provider == "openai") {
            if (!this.openai_client) {
                const error_message = "API Key not configured for OpenAI. Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }
            new Notice("Calling OpenAI");
            const params = {
                messages: conversation,
                model: model,
            };
            try {
                const completion = await this.openai_client.chat.completions.create(params);
                new Notice("Message back from OpenAI");
                const message = completion.choices[0].message as Message;
                return message.content;
            } catch (error) {
                console.error("Error fetching chat completion from OpenAI:", error);
                new Notice(error.message);
                throw error;
            }
        } else if (provider == "anthropic") {
            try {
                if (!this.anthropic_client) {
                    const error_message =
                        "API Key not configured for Anthropic.  Restart the app if you just added it!";
                    new Notice(error_message);
                    throw new Error(error_message);
                }
                new Notice("Calling Anthropic");

                // Extract system message content if it exists
                let systemContent = "";
                conversation = conversation.filter((message) => {
                    if (message.role === "system") {
                        systemContent = message.content;
                        return false; // Remove the system message from the conversation
                    }
                    return true;
                });

                const body = {
                    model: this.settings.model,
                    max_tokens: 4096,
                    messages: conversation,
                    system: systemContent, // Set the system parameter
                };

                const response = await requestUrl({
                    url: "https://api.anthropic.com/v1/messages",
                    method: "POST",
                    headers: {
                        "x-api-key": this.settings.anthropic_api_key,
                        "anthropic-version": "2023-06-01", // Add this line
                        "content-type": "application/json", // Add this line
                    },
                    body: JSON.stringify(body),
                });
                const completion = await response.json;
                new Notice("Message back from Anthropic");
                const message = completion.content[0].text;
                return message;
            } catch (error) {
                console.error("Error during Anthropic call:");
                console.error(error);
                new Notice(`Error: ${error.message}`);
                throw error;
            }
        } else if (provider == "groq") {
            if (!this.groq_client) {
                const error_message = "API Key not configured for Groq.  Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }
            new Notice("Calling Groq");

            const params = {
                messages: conversation,
                model: model,
            };
            try {
                const completion = await this.groq_client.chat.completions.create(params);
                new Notice("Message back from Groq");
                const message = completion.choices[0].message as Message;
                return message.content;
            } catch (error) {
                console.error("Error fetching chat completion from OpenAI:", error);
                new Notice(error.message);
                throw error;
            }
        } else {
            const error_message = "Invalid llm provider / model configuration";
            new Notice(error_message);
            throw new Error(error_message);
        }
    }
    async llm_call_streaming(provider: string, model: string, conversation: any[], temperature: number) {
        if (this.settings.system_prompt && this.settings.system_prompt.length > 0) {
            conversation.unshift({
                role: "system",
                content: this.settings.system_prompt,
            });
        }
        if (provider === "ollama") {
            let model_param = model;
            new Notice("Calling ollama");
            try {
                const response = await ollama.chat({
                    model: model_param,
                    messages: conversation,
                    stream: true,
                    temperature: temperature,
                });
                return response;
            } catch (error) {
                console.error(error);
                if (error.message) {
                    new Notice(error.message);
                }
                throw error;
            }
        } else if (provider == "openai") {
            if (!this.openai_client) {
                const error_message = "API Key not configured for OpenAI. Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }
            new Notice("Calling OpenAI");
            const params = {
                messages: conversation,
                model: model,
                stream: true,
                temperature: temperature,
            };
            try {
                const stream = await this.openai_client.chat.completions.create(params);
                return stream;
            } catch (error) {
                console.error("Error fetching chat completion from OpenAI:", error);
                new Notice(error.message);
                throw error;
            }
        } else if (provider == "openrouter") {
            if (!this.openrouter_client) {
                const error_message = "API Key not configured for OpenRouter. Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }
            new Notice("Calling OpenRouter");
            const params = {
                messages: conversation,
                model: model,
                stream: true,
                temperature: temperature,
            };
            try {
                const stream = await this.openrouter_client.chat.completions.create(params);
                return stream;
            } catch (error) {
                console.error("Error fetching chat completion from OpenRouter:", error);
                new Notice(error.message);
                throw error;
            }
        } else if (provider == "groq") {
            if (!this.groq_client) {
                const error_message = "API Key not configured for Groq.  Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }
            new Notice("Calling Groq");

            const params = {
                messages: conversation,
                model: model,
                stream: true,
                temperature: temperature,
            };
            try {
                const stream = await this.groq_client.chat.completions.create(params);
                return stream;
            } catch (error) {
                console.error("Error fetching chat completion from OpenAI:", error);
                new Notice(error.message);
                throw error;
            }
        } else if (provider == "anthropic") {
            new Notice("Error: Anthropic Streaming not supported");
        } else if (provider == "custom") {
            new Notice("Calling Custom Client");
            const custom_model = this.settings.model;
            const model_settings = this.settings.custom_endpoints[custom_model];
            const custom_api_key = model_settings.api_key;
            const custom_endpoint = model_settings.endpoint;

            const custom_client = new OpenAI({
                apiKey: custom_api_key,
                baseURL: custom_endpoint,
                dangerouslyAllowBrowser: true,
            });

            if (!custom_endpoint) {
                const error_message = "Custom endpoint not configured. Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }

            if (!custom_client) {
                const error_message = "Custom client not initialized properly. Restart the app if you just added it!";
                new Notice(error_message);
                throw new Error(error_message);
            }

            const params = {
                messages: conversation,
                model: model,
                stream: true,
                temperature: temperature,
            };

            try {
                const stream = await custom_client.chat.completions.create(params);
                return stream;
            } catch (error) {
                console.error("Error streaming from Custom Client:", error);
                new Notice(error.message);
                throw error;
            }
        } else {
            const error_message = "Invalid llm provider / model configuration";
            new Notice(error_message);
            throw new Error(error_message);
        }
    }

    add_sparkle_button(menuEl: HTMLElement) {
        if (!menuEl.querySelector(".spark_button")) {
            const buttonEl = createEl("button", "clickable-icon spark_button");
            setTooltip(buttonEl, "Sparkle", { placement: "top" });
            setIcon(buttonEl, "lucide-sparkles");
            buttonEl.addEventListener("click", async () => {
                const canvasView = this.app.workspace.getMostRecentLeaf().view;
                // @ts-ignore
                if (!canvasView.canvas) {
                    return;
                }
                // @ts-ignore
                const canvas = canvasView.canvas;
                await canvas.requestSave(true);
                const selection = canvas.selection;
                const selectionIterator = selection.values();
                const node = selectionIterator.next().value;
                const node_id = node.id;
                await this.sparkle(node_id);
            });
            menuEl.appendChild(buttonEl);
        }
    }
    async get_node_by_id(canvas: Canvas, node_id: string) {
        const nodes_iterator = canvas.nodes.values();
        for (const node of nodes_iterator) {
            if (node.id === node_id) {
                return node;
            }
        }
        return null; // Return null if no node matches the ID
    }

    async createChildNode(
        canvas: Canvas,
        parentNode: CanvasNodeData,
        x: number,
        y: number,
        content: string = "",
        from_side: string = "right",
        to_side: string = "left"
    ) {
        let tempChildNode = await this.addNodeToCanvas(canvas, this.generateRandomId(16), {
            x: x,
            y: y,
            width: 400,
            height: 200,
            type: "text",
            content,
        });
        await this.createEdge(parentNode, tempChildNode, canvas, from_side, to_side);

        const node = canvas.nodes?.get(tempChildNode?.id!);
        if (!node) {
            return;
        }
        return node;
    }

    async addNodeToCanvas(canvas: Canvas, id: string, { x, y, width, height, type, content }: NewNode) {
        if (!canvas) {
            return;
        }

        const data = canvas.getData();
        if (!data) {
            return;
        }

        const node: Partial<CanvasTextData | CanvasFileData> = {
            id: id,
            x: x,
            y: y,
            width: width,
            height: height,
            type: type,
        };

        switch (type) {
            case "text":
                node.text = content;
                break;
            case "file":
                node.file = content;
                break;
        }

        canvas.importData({
            nodes: [...data.nodes, node],
            edges: data.edges,
        });

        canvas.requestFrame();

        return node;
    }
    async createEdge(node1: any, node2: any, canvas: any, from_side: string = "right", to_side: string = "left") {
        this.addEdgeToCanvas(
            canvas,
            this.generateRandomId(16),
            {
                fromOrTo: "from",
                side: from_side,
                node: node1,
            },
            {
                fromOrTo: "to",
                side: to_side,
                node: node2,
            }
        );
    }
    generateRandomId(length: number): string {
        const hexArray = Array.from({ length }, () => {
            const randomHex = Math.floor(Math.random() * 16).toString(16);
            return randomHex;
        });
        return hexArray.join("");
    }
    addEdgeToCanvas(canvas: any, edgeID: string, fromEdge: any, toEdge: any) {
        if (!canvas) {
            return;
        }

        const data = canvas.getData();
        if (!data) {
            return;
        }

        canvas.importData({
            edges: [
                ...data.edges,
                {
                    id: edgeID,
                    fromNode: fromEdge.node.id,
                    fromSide: fromEdge.side,
                    toNode: toEdge.node.id,
                    toSide: toEdge.side,
                },
            ],
            nodes: data.nodes,
        });
        canvas.requestFrame();
    }

    addChatIconToRibbon() {
        this.addRibbonIcon("message-square", "Caret Chat", async (evt) => {
            await this.app.workspace.getLeaf(true).setViewState({
                type: VIEW_NAME_MAIN_CHAT,
                active: true,
            });
        });
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
