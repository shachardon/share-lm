// ============================================================================
// ShareLM Selector Configuration — Single Source of Truth
// ============================================================================
// CONSTRAINTS: This object must remain parseable by Python's json5 library.
// Do NOT use template literals, function calls, variable references, or
// anything other than plain string/number/boolean/null literals.
// ============================================================================

var SHARELM_SELECTORS = {
  platforms: {
    gradio: {
      name: "Gradio (HuggingFace)",
      url_pattern: null,
      detection: "body > gradio-app",
      user_msg: "[data-testid=\"user\"]",
      bot_msg: "[data-testid=\"bot\"]"
    },
    chatui: {
      name: "ChatUI (HuggingFace)",
      url_pattern: null,
      detection: "[class=\"contents h-full\"]",
      user_msg: "[class=\"max-w-full whitespace-break-spaces break-words rounded-2xl px-5 py-3.5 text-gray-500 dark:text-gray-400\"]",
      user_msg_fallback: "[class=\"disabled w-full appearance-none whitespace-break-spaces text-wrap break-words bg-inherit px-5 py-3.5 text-gray-500 dark:text-gray-400\"]",
      bot_msg: "[class=\"prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900\"]"
    },
    chatgpt: {
      name: "ChatGPT",
      url_pattern: "chatgpt.com",
      url_pattern_alt: "chat.openai.com",
      detection: "body > div:nth-child(5) > div.flex.h-svh.w-screen.flex-col",
      detection_fallback: "body > div.flex.h-svh.w-screen.flex-col",
      user_msg: "[data-message-author-role=\"user\"]",
      bot_msg: "[data-message-author-role=\"assistant\"]",
      link_selector: "span.max-w-full.grow.truncate.overflow-hidden.text-center"
    },
    claude: {
      name: "Claude",
      url_pattern: "claude.ai",
      detection: "div#root div#main-content",
      detection_fallback: "div#main-content",
      user_msg: "[data-testid=\"user-message\"]",
      bot_msg: ".font-claude-response",
      link_selector: "span.text-nowrap.text-text-300.break-all.truncate.font-normal.group-hover\\/tag\\:text-text-200"
    },
    grok: {
      name: "Grok",
      url_pattern: "grok.com",
      detection: "body > div[class*=\"group/sidebar-wrapper\"][class*=\"h-svh\"][class*=\"bg-sidebar\"]",
      user_msg: "[class=\"relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-end\"]",
      bot_msg: "[class=\"message-bubble relative rounded-3xl text-primary min-h-7 prose dark:prose-invert break-words prose-p:opacity-100 prose-strong:opacity-100 prose-li:opacity-100 prose-ul:opacity-100 prose-ol:opacity-100 prose-ul:my-1 prose-ol:my-1 prose-li:my-2 last:prose-li:mb-3 prose-li:ps-1 prose-li:ms-1 w-full max-w-none\"]",
      sub_bot_selectors: [
        "[class=\"response-content-markdown markdown [&_a:not(.not-prose)]:text-current [&_a:not(.not-prose):hover]:text-primary [&_a:not(.not-prose):hover]:decoration-primary [&_a:not(.not-prose)]:underline [&_a:not(.not-prose)]:decoration-primary/30 [&_a:not(.not-prose)]:underline-offset-2 [&_h2:not(.not-prose):first-child]:mt-0 [&_h3:not(.not-prose):first-child]:mt-0 [&_h4:not(.not-prose):first-child]:mt-0\"]",
        "[class=\"response-content-markdown markdown [&_a:not(.not-prose)]:text-current [&_a:not(.not-prose):hover]:text-primary [&_a:not(.not-prose):hover]:decoration-primary [&_a:not(.not-prose)]:underline [&_a:not(.not-prose)]:decoration-primary/30 [&_a:not(.not-prose)]:underline-offset-2\"]",
        "[class=\"relative not-prose @container/code-block [&_div+div]:!mt-0 mt-3 mb-3 @md:-mx-4 @md:-mr-4\"]",
        "[class=\"flex cursor-pointer rounded-2xl border border-border-l1 bg-surface-l2 hover:bg-surface-l4-hover dark:hover:bg-surface-l3\"]",
        "[class=\"relative response-content-markdown markdown [&_a:not(.not-prose)]:text-current [&_a:not(.not-prose):hover]:text-primary [&_a:not(.not-prose):hover]:decoration-primary [&_a:not(.not-prose)]:underline [&_a:not(.not-prose)]:decoration-primary/30 [&_a:not(.not-prose)]:underline-offset-2 [&_h2:not(.not-prose):first-child]:mt-0 [&_h3:not(.not-prose):first-child]:mt-0 [&_h4:not(.not-prose):first-child]:mt-0\"]",
        "[class=\"relative response-content-markdown markdown [&_a:not(.not-prose)]:text-current [&_a:not(.not-prose):hover]:text-primary [&_a:not(.not-prose):hover]:decoration-primary [&_a:not(.not-prose)]:underline [&_a:not(.not-prose)]:decoration-primary/30 [&_a:not(.not-prose)]:underline-offset-2\"]"
      ],
      sub_bot_filters: [
        "[class=\"flex flex-row px-4 py-2 h-10 items-center rounded-t-xl bg-surface-l2 border border-border-l1\"]",
        "[class=\"sticky w-full right-2 z-10 @[1280px]/mainview:z-40 @[1280px]/mainview:top-10 top-24 @[0px]/preview:top-5 print:hidden\"]",
        "[class=\"katex-html\"]",
        "[class=\"katex-mathml\"] > math > semantic > mrow",
        "mrow"
      ]
    },
    gemini: {
      name: "Gemini",
      url_pattern: "gemini.google.com",
      detection: null,
      user_msg: "div.query-text",
      bot_msg: "div.markdown-main-panel"
    },
    mistral: {
      name: "Mistral",
      url_pattern: "chat.mistral.ai",
      detection: "main",
      detection_fallback: "main",
      user_msg: "[data-message-author-role=\"user\"] .select-text",
      bot_msg: "[data-message-author-role=\"assistant\"] [data-message-part-type=\"answer\"]"
    },
    poe: {
      name: "Poe",
      url_pattern: "poe.com",
      detection: null,
      user_msg: ".Prose_presets_theme-on-accent__rESxX",
      bot_msg: ".Prose_presets_theme-hi-contrast__LQyM9"
    },
    perplexity: {
      name: "Perplexity",
      url_pattern: "perplexity.ai",
      detection: null,
      user_msg: ".font-display.text-pretty",
      bot_msg: "div.prose"
    },
    cohere: {
      name: "Cohere",
      url_pattern: "dashboard.cohere.com",
      detection: "section:has([data-component=\"ChatFuncitonality\"])",
      user_msg: "[data-source-file=\"MessageContent.tsx\"] textarea",
      bot_msg: "[data-source-file=\"Markdown.tsx\"]"
    }
  },
  rating: {
    parent: "div.absolute.-bottom-4.right-0",
    positive: "[title=\"Remove +1\"]",
    negative: "[title=\"Remove -1\"]"
  },
  canvas: {
    content: "#codemirror > div > div.cm-scroller > div",
    container: "#codemirror"
  }
};
