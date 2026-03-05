import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css'; // import <widget-name>.css
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

const kuroshiro = new Kuroshiro();
let initializationPromise: Promise<void> | null = null;

async function initAnalyzer() {
  // concurrency safe
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const analyzer = new KuromojiAnalyzer({ 
        dictPath: "/dict" 
      });

      await kuroshiro.init(analyzer);
      
      console.log("Furigana Helper: Dictionary loaded ✅");
    } catch (e) {
      initializationPromise = null; 
      console.error("Furigana Helper: Failed to load dictionary ❌", e);
      throw e;
    }
  })();

  return initializationPromise;
}

async function getFuriganaLatex(plugin: ReactRNPlugin, text: string): Promise<string> {
  // Ensure the kuroshiro analyzer is initialized before conversion
  await initAnalyzer();
  const useTiny = await plugin.settings.getSetting('furigana size');
  const sizeCmd = useTiny ? "\\tiny " : "";

  const result = await kuroshiro.convert(text, { to: "hiragana", mode: "furigana" });
  
  // Clean up HTML tags and extract content 
  const latex = result.replace(/<ruby>(?:<rp>.*?<\/rp>)?(.*?)(?:<rp>.*?<\/rp>)?<rt>(.*?)<\/rt>(?:<rp>.*?<\/rp>)?<\/ruby>/g, (_, kanji, furigana) => {
    const cleanKanji = kanji.replace(/<[^>]+>/g, ""); 
    return `}\\overset{${sizeCmd}\\text{${furigana}}}{\\text{${cleanKanji}}}\\text{`;
  });

  return `\\text{${latex}}`.replace(/\\text\{\}/g, "");
}


async function onActivate(plugin: ReactRNPlugin) {
  
  await plugin.settings.registerBooleanSetting({
    id: 'furigana size',
    title: 'Tiny Furigana',
    defaultValue: false,
  });

  await plugin.settings.registerNumberSetting({
    id: 'max threshold',
    title: 'Max Sentence Length',
    description: 'The maximum characters per LaTeX line. Exceeding this forces a break to prevent screen overflow.',
    defaultValue: 30,
  });


  await plugin.app.registerWidget(
    'selected_text_furigana', 
    WidgetLocation.SelectedTextMenu, 
    {
      dimensions: {
        height: 'auto',
        width: '100%',
      },
      widgetTabIcon: 'https://cdn-icons-png.flaticon.com/512/2069/2069571.png',
      widgetTabTitle: 'Furigana',
    },
  );

  await plugin.app.registerCommand({
    id: 'furigana',
    name: 'add furigana', 
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      if (!focusedRem) return;

      const rawText = await plugin.richText.toString(focusedRem.text);
      
      const MAX_THRESHOLD = (await plugin.settings.getSetting('max threshold')) as number || 30;

      const allParts = rawText.split(/([。、！？\n])/g).filter(p => p !== "");
      const richTextArray: any[] = [];
      let currentBuffer = "";

      for (let i = 0; i < allParts.length; i++) {
        const part = allParts[i];
        const isSentenceEnd = /[。！？\n]/.test(part);

        if (currentBuffer.length + part.length > MAX_THRESHOLD) {
          
          if (currentBuffer.length > 0) {
            const latex = await getFuriganaLatex(plugin, currentBuffer);
            richTextArray.push({ i: "x", text: latex, block: false });
            currentBuffer = "";
          }

          if (part.length > MAX_THRESHOLD) {
            let remaining = part;
            while (remaining.length > MAX_THRESHOLD) {
              const slice = remaining.slice(0, MAX_THRESHOLD);
              richTextArray.push({ i: "x", text: await getFuriganaLatex(plugin, slice), block: false });
              remaining = remaining.slice(MAX_THRESHOLD);
            }
            currentBuffer = remaining;
          } else {
            currentBuffer = part;
          }
        } 
        else {
          // greedy
          currentBuffer += part;
          
          if (isSentenceEnd && currentBuffer.length >= MAX_THRESHOLD * 0.8) {
             richTextArray.push({ i: "x", text: await getFuriganaLatex(plugin, currentBuffer), block: false });
             currentBuffer = "";
          }
          
        }
      }

      // buffer flush
      if (currentBuffer.length > 0) {
        if (currentBuffer === "\n") {
          richTextArray.push("\n");
        } else {
          const latex = await getFuriganaLatex(plugin, currentBuffer);
          richTextArray.push({ i: "x", text: latex, block: false });
        }
      }

      await focusedRem.setText(richTextArray);
      await plugin.app.toast("Furigana added! ✨");
    },
        keyboardShortcut: 'alt+shift+f', 
  });
}  


async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
