import Groq from "groq-sdk";
import { around } from "monkey-around";
import { Canvas, ViewportNode } from "./types";
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
    View,
} from "obsidian";
import {
    NodeSide,
    EdgeEnd,
    CanvasColor,
    CanvasData,
    CanvasEdgeData,
    CanvasFileData,
    CanvasGroupData,
    CanvasLinkData,
    CanvasNodeData,
    CanvasTextData,
    AllCanvasNodeData,
} from "obsidian/canvas";
import { syntaxTree } from "@codemirror/language";
import { Extension, RangeSetBuilder, StateField, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import * as dotenv from "dotenv";
// dotenv.config({ debug: true}

const basePath = "/Users/jacobcolling/Documents/accelerate/accelerate/";

dotenv.config({
    path: `${basePath}/.obsidian/plugins/caret/.env`,
    debug: true,
});

const groq_api_key = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: groq_api_key, dangerouslyAllowBrowser: true });

// Start of node and edge functions
interface edgeT {
    fromOrTo: string;
    side: string;
    node: CanvasNodeData;
}

interface TreeNode {
    id: string;
    children: TreeNode[];
}

interface Node {
    id: string;
    type: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Edge {
    id: string;
    fromNode: string;
    fromSide: string;
    toNode: string;
    toSide: string;
}
export class CMDJModal extends Modal {
    result: string;
    selectedText: string;
    startIndex: number;
    endIndex: number;

    constructor(app: App, selectedText: string, startIndex: number, endIndex: number) {
        super(app);
        this.selectedText = selectedText;
        this.startIndex = startIndex;
        this.endIndex = endIndex;
    }

    onOpen() {
        const { contentEl } = this;
        const textDisplay = contentEl.createEl("div", {
            text: this.selectedText,
        });
        textDisplay.style.height = "60px";
        textDisplay.style.overflow = "scroll";

        contentEl.createEl("br"); // Line break

        const textArea = contentEl.createEl("textarea", {
            placeholder: "Type here...",
        });
        textArea.style.width = "100%";
        textArea.style.minHeight = "100px";
        textArea.style.resize = "none";
        textArea.oninput = () => {
            textArea.style.height = ""; // Reset the height
            textArea.style.height = `${textArea.scrollHeight}px`;
        };

        const buttonContainer = contentEl.createEl("div", { cls: "button-container" });
        // buttonContainer.style.display = "flex";
        // buttonContainer.style.justifyContent = "space-between"; // This will space the buttons evenly

        // Create the "Append Output" button
        new Setting(buttonContainer)
            .addButton((btn) =>
                btn
                    .setButtonText("Append Output")

                    .onClick(async () => {
                        this.result = textArea.value; // Capture the value from the textarea

                        const content = await this.submit_edit(this.result);
                        this.insert_response(content);
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Replace")
                    .setCta()
                    .onClick(async () => {
                        this.result = textArea.value; // Capture the value from the textarea
                        const content = await this.submit_edit(this.result);
                        this.apply_delete(this.result);
                        this.insert_response(content, true);
                        this.close();
                    })
            );
    }

    async submit_edit(result: string) {
        let message = `
Please apply the following instructions to the below content:

Instructions:
${this.result}

Content:
${this.selectedText}

## Rules:
- Just return the reponse that follows the instructions. No need to include a preample or anything

## Markdown Formatting: 
Always apply markdown formatting. For keywords use the following:
	todos - Prepend todo lines with:
	- [ ] 
`.trim();

        const data = { message };
        const resp = await fetch("http://localhost:8000/single-turn", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });
        const output = await resp.json();
        return output.content;
    }

    insert_response(response: string, replace: boolean = false) {
        const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
        if (editor) {
            let index = this.endIndex;
            if (replace) {
                index = index + 4;
            }
            const pos = editor.offsetToPos(index);
            editor.replaceRange(`\n|+${response}+|`, pos);
            editor.setCursor(pos); // Optionally set the cursor after the inserted text
            editor.focus(); // Focus the editor after inserting text
        }
    }

    apply_delete(text: string) {
        const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
        if (editor) {
            const content = editor.getValue();
            const index = content.indexOf(this.selectedText);
            if (index !== -1) {
                const beforeText = content.substring(0, index);
                const afterText = content.substring(index + this.selectedText.length);
                const newText = beforeText + `|-${this.selectedText}-|` + afterText;
                editor.setValue(newText);
            }
        }
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}

export const redBackgroundField = StateField.define<DecorationSet>({
    create(state): DecorationSet {
        return Decoration.none;
    },
    update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const docText = transaction.state.doc.toString();
        const delete_regex = /\|-(.*?)-\|/gs; // Changed to match across lines
        const add_regex = /\|\+(.*?)\+\|/gs; // Changed to match across lines
        let delete_match;
        let add_match;
        let ranges = [];

        while ((delete_match = delete_regex.exec(docText)) !== null) {
            const start = delete_match.index;
            const end = delete_regex.lastIndex;
            ranges.push({ start, end, style: "background-color: #f56c62;" });
        }

        while ((add_match = add_regex.exec(docText)) !== null) {
            const start = add_match.index;
            const end = add_regex.lastIndex;
            ranges.push({ start, end, style: "background-color: #64f562;" });
        }
        // Sort ranges by start position
        ranges.sort((a, b) => a.start - b.start);

        // Add sorted ranges to the builder
        ranges.forEach((range) => {
            builder.add(
                range.start,
                range.end,
                Decoration.mark({
                    attributes: { style: range.style },
                })
            );
        });

        return builder.finish();
    },
    provide(field: StateField<DecorationSet>): Extension {
        return EditorView.decorations.from(field);
    },
});
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: "default",
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
class MainChat extends ItemView {
    chat_id: string;
    constructor(
        leaf: WorkspaceLeaf,
        chat_id?: string,
        conversation: { content: string; role: "user" | "system" }[] = []
    ) {
        super(leaf);
        this.chat_id = chat_id || this.generateRandomID(5);
        this.conversation = conversation; // Initialize conversation list with default or passed value
    }
    textBox: HTMLTextAreaElement;
    messagesContainer: HTMLElement; // Container for messages
    conversation: { content: string; role: "user" | "system" }[]; // List to store conversation messages

    getViewType() {
        return VIEW_NAME_MAIN_CHAT;
    }

    getDisplayText() {
        return `MLX Local Chat: ${this.chat_id}`;
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

        // Render initial conversation
        this.renderConversation();
        this.createChatInputArea(container);
    }
    createChatInputArea(container: HTMLElement) {
        // Create a container for the text box
        const inputContainer = container.createEl("div", {});

        // Create the text box within the input container
        this.textBox = inputContainer.createEl("textarea", {
            cls: "full_width_text_container",
        });
        this.textBox.placeholder = "Type something...";

        // Create a separate container for buttons within the input container
        const buttonContainer = inputContainer.createEl("div", {
            cls: "button-container",
        });

        // Create the save button within the button container
        const saveButton = buttonContainer.createEl("button");
        saveButton.textContent = "Save Chat";
        saveButton.addEventListener("click", () => {
            this.saveChat(); // Call the saveChat function to save the conversation
        });

        // Create the submit button within the button container
        const submitButton = buttonContainer.createEl("button");
        submitButton.textContent = "Submit";
        submitButton.addEventListener("click", () => {
            this.submitMessage(this.textBox.value);
            this.textBox.value = ""; // Clear the text box after sending
        });
    }

    addMessage(text: string, sender: "user" | "system") {
        // Add message to the conversation array
        this.conversation.push({ content: text, role: sender });
        // Re-render the conversation in the HTML
        this.renderConversation();
    }

    renderConversation() {
        // Clear the current messages
        this.messagesContainer.empty();

        // Add each message in the conversation to the messages container
        this.conversation.forEach((message) => {
            const messageDiv = this.messagesContainer.createEl("div", {
                cls: `message ${message.role}`,
            });
            messageDiv.textContent = message.content;
        });
    }

    async submitMessage(userMessage: string) {
        this.addMessage(userMessage, "user"); // Display the user message immediately

        const data = {
            conversation: this.conversation,
        };
        try {
            const response = await fetch("http://localhost:8000/conversation", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
            const output = await response.json();
            this.addMessage(output.response, "system"); // Display the response
        } catch (error) {
            console.error("Error:", error);
        }
    }
    async saveChat() {
        const chat_folder_path = "chats/";
        const file_name = `${this.chat_id}.md`;
        const file_path = chat_folder_path + file_name;

        let file_content = `\`\`\`xml
		<metadata>\n<id>${this.chat_id}</id>\n</metadata>
		`;

        let messages = ``;

        this.conversation.forEach((message) => {
            const message_xml = `
			<message>
				<role>${message.role}</role>
				<content>${message.content}</content>
			</message>
			`.trim();
            messages += message_xml;
        });
        let conversation = `<conversation>\n${messages}</conversation>\`\`\``;
        file_content += conversation;
        const file = await this.app.vault.getFileByPath(file_path);

        try {
            if (file) {
                await this.app.vault.modify(file, file_content);
            } else {
                await this.app.vault.create(file_path, file_content);
            }
        } catch (error) {
            console.error("Failed to save chat:", error);
        }
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

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    async onload() {
        this.addCommand({
            id: "patch-menu",
            name: "Patch Menu",
            callback: async () => {
                this.patchCanvasMenu();
            },
        });
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                console.log("Leaf changed");
                const currentLeaf = this.app.workspace.activeLeaf;
                if (currentLeaf?.view.getViewType() === "canvas") {
                    console.log("Leaf is canvas!");
                    this.patchCanvasMenu();
                }
            })
        );

        await this.loadSettings();
        this.registerEditorExtension([redBackgroundField]);

        // Register the sidebar icon
        this.addSidebarTab();

        this.addCommand({
            id: "log",
            name: "Log",
            callback: async () => {
                const currentLeaf = this.app.workspace.activeLeaf;
                if (currentLeaf?.view.getViewType() === "canvas") {
                    const canvasView = currentLeaf.view;
                    const canvas = (canvasView as any).canvas;
                    console.log(canvas);
                    console.log(canvas.nodeIndex.data.children);
                    const viewportNodes = canvas.getViewportNodes();
                    console.log(viewportNodes);
                }
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
                    let average_y = 0;
                    let average_height = 0;
                    let average_width = 0;
                    let max_x = 0;
                    let total_y = 0;
                    let count = 0;
                    let total_height = 0;
                    let total_width = 0;
                    let all_text = "";
                    for (const obj of selection) {
                        const { x, y, height, width } = obj;
                        max_x = Math.max(max_x, x);
                        total_y += y;
                        total_height += height;
                        total_width += width;
                        count++;
                        if ("text" in obj) {
                            const { text } = obj;

                            all_text += text + "\n";
                        } else if ("filePath" in obj) {
                            let { filePath } = obj;
                            const file = await this.app.vault.getFileByPath(filePath);
                            if (file) {
                                const text = await this.app.vault.read(file);
                                const file_text = `
                                Title: ${filePath.replace(".md", "")}
                                ${text}
                                `.trim();
                                all_text += file_text;
                            }
                        }
                    }
                    average_y = count > 0 ? total_y / count : 0;
                    average_height = count > 0 ? total_height / count : 0;
                    average_width = count > 0 ? total_width / count : 0;

                    // This handles the model ---
                    // Create a modal with a text input and a submit button
                    const modal = new Modal(this.app);
                    modal.contentEl.createEl("h1", { text: "Canvas Prompt" });
                    const container = modal.contentEl.createDiv({ cls: "flex-col" });
                    const textArea = container.createEl("textarea", {
                        placeholder: "",
                        cls: "w-full mb-2",
                    });
                    const submitButton = container.createEl("button", { text: "Submit" });
                    submitButton.onclick = async () => {
                        modal.close();
                        const prompt = `
                        Please do the following:
                        ${textArea.value}

                        Given this content:
                        ${all_text}
                        `;

                        const content = await one_shot(prompt);
                        const textNodeConfig = {
                            pos: { x: max_x + 50, y: average_y }, // Position on the canvas
                            size: { width: average_width, height: average_height }, // Size of the text box
                            position: "center", // This might relate to text alignment
                            text: content, // Text content from input
                            save: true, // Save this node's state
                            focus: true, // Focus and start editing immediately
                        };

                        // Create the text node on the canvas
                        const node = canvas.createTextNode(textNodeConfig);
                        const node_id = node.id;
                        node.color = "6";
                        node.zoomToSelection();
                    };
                    modal.open();
                }
            },
        });

        this.addCommand({
            id: "create-child",
            name: "Create Child",
            callback: async () => {
                const currentLeaf = this.app.workspace.activeLeaf;
                if (currentLeaf?.view.getViewType() === "canvas") {
                    const canvasView = currentLeaf.view;
                    const canvas = (canvasView as any).canvas;
                    const selection = canvas.selection;
                    const selectionIterator = selection.values();
                    const node = selectionIterator.next().value;
                    childNode(canvas, node, node.y);
                }
            },
        });

        this.addCommand({
            id: "open-cmdj-modal",
            name: "Open CMD+J Modal",
            hotkeys: [{ modifiers: ["Mod"], key: "j" }],
            callback: () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.editor) {
                    const selectedText = activeView.editor.getSelection();
                    const content = activeView.editor.getValue();
                    const startIndex = content.indexOf(selectedText);
                    const endIndex = startIndex + selectedText.length;
                    new CMDJModal(this.app, selectedText, startIndex, endIndex).open();
                } else {
                    new Notice("No active markdown editor or no text selected.");
                }
            },
        });

        // Register the custom view
        this.registerView(VIEW_NAME_SIDEBAR_CHAT, (leaf) => new SidebarChat(leaf));
        this.registerView(VIEW_NAME_MAIN_CHAT, (leaf) => new MainChat(leaf));
        // Define a command to insert text into the sidebar
        this.addCommand({
            id: "insert-text-into-sidebar",
            name: "Insert Text into Sidebar",
            hotkeys: [{ modifiers: ["Mod"], key: "l" }],
            callback: () => {
                const activeLeaf = this.app.workspace.activeLeaf;
                if (activeLeaf) {
                    const editor = activeLeaf.view instanceof MarkdownView ? activeLeaf.view.editor : null;
                    if (editor) {
                        const selectedText = editor.getSelection();
                        this.insertTextIntoSidebar(selectedText);
                    }
                }
            },
        });

        // Define a command to clear text from the sidebar
        this.addCommand({
            id: "clear-text-in-sidebar",
            name: "Clear Text in Sidebar",
            hotkeys: [{ modifiers: ["Mod"], key: ";" }],
            callback: () => {
                this.clearTextInSidebar();
            },
        });

        async function one_shot(message: string) {
            const data = { message };
            const resp = await fetch("http://localhost:8000/single-turn", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
            const output = await resp.json();
            return output.content;
        }

        function parseCustomXML(xmlString: string) {
            // Function to extract content between tags
            function getContent(tag: string, string: string) {
                const openTag = `<${tag}>`;
                const closeTag = `</${tag}>`;
                const start = string.indexOf(openTag) + openTag.length;
                const end = string.indexOf(closeTag);
                return string.substring(start, end).trim();
            }

            // Extract conversation ID
            const conversationId = getContent("id", xmlString);

            // Initialize the result object with metadata
            const result = {
                metadata: {
                    id: conversationId,
                },
                conversation: {
                    messages: [],
                },
            };

            // Extract messages
            const messagesContent = getContent("conversation", xmlString);
            const messageTags = messagesContent.split("</message>").slice(0, -1); // Split and remove last empty element

            for (const messageTag of messageTags) {
                const role = getContent("role", messageTag);
                const content = getContent("content", messageTag);
                //@ts-ignore // TODO - Remove this and fix it
                result.conversation.messages.push({ role, content });
            }

            return result;
        }

        this.addCommand({
            id: "open-chat",
            name: "Open Chat",
            callback: async () => {
                const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                if (editor) {
                    let content = editor.getValue();
                    content = content.replace("```xml", "").trim();
                    content = content.replace("```", "").trim();
                    const xml = parseCustomXML(content);
                    const convo_id = xml.metadata.id;
                    const messages = xml.conversation.messages;

                    if (convo_id && messages) {
                        const leaf = this.app.workspace.getLeaf(true);
                        const chatView = new MainChat(leaf, convo_id, messages);
                        // await leaf.setViewState({
                        //     type: VIEW_NAME_MAIN_CHAT,
                        //     state: { chatId: convo_id, messages: messages },
                        //     active: true,
                        // });
                        leaf.open(chatView);
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
            id: "apply-diffs",
            name: "Apply Diffs",
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

    patchCanvasMenu() {
        const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
        if (!canvasView) {
            return;
        }
        const canvas = canvasView.canvas;

        const menu = canvasView.canvas.menu;
        if (!menu) {
            console.error("No menu found on the canvas");
            return;
        }
        const that = this; // Capture the correct 'this' context.

        const menuUninstaller = around(menu.constructor.prototype, {
            render: (next: any) =>
                function (...args: any) {
                    const result = next.call(this, ...args);
                    that.addGraphButtonIfNeeded(this.menuEl);
                    that.addAIButtonIfNeeded(this.menuEl);

                    return result;
                },
        });
        console.log("Heree---");
        console.log(canvasView.constructor.prototype);
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

        // const canvasViewunistaller = around(canvasView.constructor.prototype, {
        //     onOpen: (next) =>
        //         async function () {
        //             if (true) {
        //                 console.log(this.scope);
        //                 this.scope.register(["Mod"], "ArrowUp", () => {
        //                     that.navigate(this.canvas, "top");
        //                 });
        //                 this.scope.register(["Mod"], "ArrowDown", () => {
        //                     that.navigate(this.canvas, "bottom");
        //                 });
        //                 this.scope.register(["Mod"], "ArrowLeft", () => {
        //                     that.navigate(this.canvas, "left");
        //                 });
        //                 this.scope.register(["Mod"], "ArrowRight", () => {
        //                     that.navigate(this.canvas, "right");
        //                 });
        //                 this.scope.register(["Mod"], "Enter", () => {
        //                     that.start_editing_node(this.canvas);
        //                 });
        //             }
        //             this.scope.register(["Mod", "Shift"], "ArrowUp", () => {
        //                 that.create_directional_node(this.canvas, "top");
        //             });
        //             this.scope.register(["Mod", "Shift"], "ArrowDown", () => {
        //                 that.create_directional_node(this.canvas, "bottom");
        //             });
        //             this.scope.register(["Mod", "Shift"], "ArrowLeft", () => {
        //                 that.create_directional_node(this.canvas, "left");
        //             });
        //             this.scope.register(["Mod", "Shift"], "ArrowRight", () => {
        //                 that.create_directional_node(this.canvas, "right");
        //             });
        //             this.scope.register(["Mod", "Shift"], "Enter", () => {
        //                 that.run_graph_chat(this.canvas);
        //             });

        //             return next.call(this);
        //         },
        // });

        this.register(menuUninstaller);
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

        this.childNode(canvas, node, x, y, "<role>user</role>", from_side, to_side);
    }
    start_editing_node(canvas) {
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        const node_id = node.id;
        node.isEditing = true;
        const editButton = document.querySelector('.canvas-menu button[aria-label="Edit"]');
        if (editButton) {
            editButton.click(); // Simulate the click on the edit button
        } else {
            console.error("Edit button not found");
        }
    }
    run_graph_chat(canvas) {
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        const node_id = node.id;
        node.isEditing = true;
        const editButton = document.querySelector('.canvas-menu button[aria-label="Sparkle"]');
        if (editButton) {
            editButton.click(); // Simulate the click on the edit button
        } else {
            console.error("Edit button not found");
        }
    }
    navigate(canvas, direction: string) {
        // const canvas = canvasView.canvas;
        const selection = canvas.selection;
        const selectionIterator = selection.values();
        const node = selectionIterator.next().value;
        console.log("In canvas");
        console.log(node);
        if (!node) {
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
                const edgeRightFrom = edges.find((edge) => edge.fromNode === node_id && edge.fromSide === "right");
                if (edgeRightFrom) {
                    targetNodeID = edgeRightFrom.toNode;
                } else {
                    const edgeRightTo = edges.find((edge) => edge.toNode === node_id && edge.toSide === "right");
                    if (edgeRightTo) {
                        targetNodeID = edgeRightTo.fromNode;
                    }
                }
                break;
            case "left":
                // Handle both 'from' and 'to' cases for 'left'
                const edgeLeftFrom = edges.find((edge) => edge.fromNode === node_id && edge.fromSide === "left");
                if (edgeLeftFrom) {
                    targetNodeID = edgeLeftFrom.toNode;
                } else {
                    const edgeLeftTo = edges.find((edge) => edge.toNode === node_id && edge.toSide === "left");
                    if (edgeLeftTo) {
                        targetNodeID = edgeLeftTo.fromNode;
                    }
                }
                break;
            case "top":
                // Handle both 'from' and 'to' cases for 'top'
                const edgeTopFrom = edges.find((edge) => edge.fromNode === node_id && edge.fromSide === "top");
                if (edgeTopFrom) {
                    targetNodeID = edgeTopFrom.toNode;
                } else {
                    const edgeTopTo = edges.find((edge) => edge.toNode === node_id && edge.toSide === "top");
                    if (edgeTopTo) {
                        targetNodeID = edgeTopTo.fromNode;
                    }
                }
                break;
            case "bottom":
                // Handle both 'from' and 'to' cases for 'bottom'
                const edgeBottomFrom = edges.find((edge) => edge.fromNode === node_id && edge.fromSide === "bottom");
                if (edgeBottomFrom) {
                    targetNodeID = edgeBottomFrom.toNode;
                } else {
                    const edgeBottomTo = edges.find((edge) => edge.toNode === node_id && edge.toSide === "bottom");
                    if (edgeBottomTo) {
                        targetNodeID = edgeBottomTo.fromNode;
                    }
                }
                break;
        }
        // const viewportNodes = canvas.getViewportNodes();
        let viewport_nodes: ViewportNode[] = [];
        let initial_viewport_children = canvas.nodeIndex.data.children;
        console.log("View port nodes");
        if (initial_viewport_children.length > 1) {
            for (let i = 0; i < initial_viewport_children.length; i++) {
                const nodes_list = initial_viewport_children[i].children;
                console.log({ nodes_list });
                nodes_list.forEach((node: ViewportNode) => {
                    viewport_nodes.push(node);
                });
            }
        }

        console.log(viewport_nodes);
        console.log(targetNodeID);

        if (targetNodeID) {
            const target_node = viewport_nodes.find((node) => node.id === targetNodeID);
            console.log(target_node);
            console.log("Makes it here");

            // console.log({ target_node });
            canvas.selectOnly(target_node);
            canvas.zoomToSelection();
        }
    }

    addGraphButtonIfNeeded(menuEl: HTMLElement) {
        if (!menuEl.querySelector(".graph-menu-item")) {
            const graphButtonEl = createEl("button", "clickable-icon graph-menu-item");
            setTooltip(graphButtonEl, "Create Node", { placement: "top" });
            setIcon(graphButtonEl, "lucide-workflow");
            graphButtonEl.addEventListener("click", () => {
                console.log("Graph button clicked");
                // Assuming canvasView is accessible here, or you need to pass it similarly
                const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
                const canvas = canvasView.canvas;
                const selection = canvas.selection;
                const selectionIterator = selection.values();
                const node = selectionIterator.next().value;
                const x = node.x + node.width + 200;
                this.childNode(canvas, node, x, node.y, "<role>user</role>");
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

    addAIButtonIfNeeded(menuEl: HTMLElement) {
        if (!menuEl.querySelector(".gpt-menu-item")) {
            const buttonEl = createEl("button", "clickable-icon gpt-menu-item");
            setTooltip(buttonEl, "Sparkle", { placement: "top" });
            setIcon(buttonEl, "lucide-sparkles");
            buttonEl.addEventListener("click", async () => {
                const canvasView = this.app.workspace.getLeavesOfType("canvas").first()?.view;
                const canvas = canvasView.canvas;
                const selection = canvas.selection;
                const selectionIterator = selection.values();
                const node = selectionIterator.next().value;
                const canvas_data = canvas.getData();
                const { edges, nodes } = canvas_data;

                // const ancestors = this.get_ancestors(nodes, edges, node.id);
                // const all_ancestors = this.getAllAncestorNodes(nodes, edges, node.id);
                const longest_lineage = this.getLongestLineage(nodes, edges, node.id);
                let conversation = [];
                for (let i = 0; i < longest_lineage.length; i++) {
                    const node = longest_lineage[i];
                    const text = node.text;
                    const userRegex = /<role>User<\/role>/i;
                    const assistantRegex = /<role>assistant<\/role>/i;

                    if (userRegex.test(text)) {
                        const split_text = text.split(userRegex);
                        const role = "user";
                        const content = split_text[1].trim();
                        const message = {
                            role,
                            content,
                        };
                        conversation.push(message);
                    }
                    if (assistantRegex.test(text)) {
                        const split_text = text.split(assistantRegex);
                        const role = "assistant";
                        const content = split_text[1].trim();
                        const message = {
                            role,
                            content,
                        };
                        conversation.push(message);
                    }
                }
                conversation.reverse();
                console.log({ conversation });

                const data = {
                    conversation,
                };

                // This is for local
                // try {
                //     const response = await fetch("http://localhost:8000/conversation", {
                //         method: "POST",
                //         headers: {
                //             "Content-Type": "application/json",
                //         },
                //         body: JSON.stringify(data),
                //     });
                //     const output = await response.json();
                //     console.log(output);
                //     if (output) {
                //         const content = `<role>assistant</role>\n${output.response}`;
                //         const x = node.x + node.width + 200;
                //         this.childNode(canvas, node, x, node.y, content);
                //     }
                // } catch (error) {
                //     console.error("Error:", error);
                // }
                const model = "llama3-70b-8192";

                const params = {
                    messages: conversation,
                    model: model,
                    // tools: tools,
                    // tool_choice: tool_choice,
                    max_tokens: 12000,
                    stop: null,
                };

                // @ts-ignore
                new Notice("Calling Groq!");
                const chat_completion: OpenAI.Chat.ChatCompletion = await groq.chat.completions.create(params);
                console.log(chat_completion);
                const content = chat_completion.choices[0].message.content;
                const node_content = `<role>assistant</role>\n${content}`;
                const x = node.x + node.width + 200;
                this.childNode(canvas, node, x, node.y, node_content, "right", "left", "groq");
            });
            menuEl.appendChild(buttonEl);
        }
    }

    childNode = async (
        canvas: Canvas,
        parentNode: CanvasNodeData,
        x: number,
        y: number,
        content: string = "",
        from_side: string = "right",
        to_side: string = "left",
        origin: string = "ignore"
    ) => {
        let tempChildNode = this.addNode(canvas, this.random(16), {
            x: x,
            y: y,
            width: parentNode.width,
            height: parentNode.height,
            type: "text",
            content,
        });
        await this.createEdge(parentNode, tempChildNode, canvas, from_side, to_side);

        const node = canvas.nodes?.get(tempChildNode?.id!);
        if (!node) return;
        if (origin === "groq") {
            new Notice("Message back from Groq");
        }

        // canvas.selectOnly(node);

        canvas.requestSave();

        return tempChildNode;
    };

    addNode = (
        canvas: Canvas,
        id: string,
        {
            x,
            y,
            width,
            height,
            type,
            content,
            subpath,
        }: {
            x: number;
            y: number;
            width: number;
            height: number;
            type: "text" | "file";
            content: string;
            subpath?: string;
        }
    ) => {
        if (!canvas) return;

        const data = canvas.getData();
        if (!data) return;

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
                if (subpath) node.subpath = subpath;
                break;
        }

        canvas.importData(<CanvasData>{
            nodes: [...data.nodes, node],
            edges: data.edges,
        });

        canvas.requestFrame();

        return node;
    };
    createEdge = async (node1: any, node2: any, canvas: any, from_side: string = "right", to_side: string = "left") => {
        this.addEdge(
            canvas,
            this.random(16),
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
    };
    // TODO - Change this
    random = (e: number) => {
        let t = [];
        for (let n = 0; n < e; n++) {
            t.push(((16 * Math.random()) | 0).toString(16));
        }
        return t.join("");
    };
    addEdge = (canvas: any, edgeID: string, fromEdge: edgeT, toEdge: edgeT) => {
        if (!canvas) return;

        const data = canvas.getData();
        if (!data) return;

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
    };

    // Method to insert text into the sidebar
    insertTextIntoSidebar(text: string) {
        const trimmed_text = text.trim();
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === VIEW_NAME_SIDEBAR_CHAT) {
                const view = leaf.view as SidebarChat;
                if (view.textBox) {
                    view.textBox.value += trimmed_text;
                }
            }
        });
    }

    // Method to clear text from the sidebar
    clearTextInSidebar() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === VIEW_NAME_SIDEBAR_CHAT) {
                const view = leaf.view as SidebarChat;
                if (view.textBox) {
                    view.textBox.value = ""; // Clear the text box
                }
                if (view.messagesContainer) {
                    view.messagesContainer.innerHTML = ""; // Clear the messages container
                }
            }
        });
    }
    addSidebarTab() {
        this.addRibbonIcon("document", "Open Caret", async (evt) => {
            // Check if the view is already present in any leaf

            // This creates the view in the sidebar
            // let found = false;
            // this.app.workspace.iterateAllLeaves((leaf) => {
            //     if (leaf.view.getViewType() === VIEW_NAME_SIDEBAR_CHAT) {
            //         found = true;
            //         // If the view is not the active view, bring it into focus
            //         if (!leaf.view.containerEl.parentElement.classList.contains("is-active")) {
            //             this.app.workspace.revealLeaf(leaf);
            //         }
            //     }
            // });

            // // If the view was not found, create it in the right sidebar
            // if (!found) {
            //     await this.app.workspace.getRightLeaf(false).setViewState({
            //         type: VIEW_NAME_SIDEBAR_CHAT,
            //         active: true,
            //     });
            //     this.app.workspace.revealLeaf(this.app.workspace.getLeaf(true));
            // }

            let main_chat_found = false;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === VIEW_NAME_MAIN_CHAT) {
                    main_chat_found = true;
                    // If the view is not the active view, bring it into focus
                    // @ts-ignore
                    if (!leaf.view.containerEl.parentElement.classList.contains("is-active")) {
                        this.app.workspace.revealLeaf(leaf);
                    }
                }
            });

            // If the view was not found, create it in the right sidebar
            if (!main_chat_found) {
                await this.app.workspace.getLeaf(true).setViewState({
                    type: VIEW_NAME_MAIN_CHAT,
                    active: true,
                });
                // this.app.workspace.revealLeaf(this.app.workspace.getLeaf(true));
            }
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

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Setting #1")
            .setDesc("It's a secret")
            .addText((text) =>
                text
                    .setPlaceholder("Enter your secret")
                    .setValue(this.plugin.settings.mySetting)
                    .onChange(async (value) => {
                        this.plugin.settings.mySetting = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
