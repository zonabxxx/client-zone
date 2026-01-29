/**
 * Google Cloud Translation API utility
 * Translates text dynamically between languages
 */

// Simple in-memory cache for translations (persists during request)
const translationCache = new Map<string, string>();

/**
 * Translate text using Google Cloud Translation API
 * @param text - Text to translate
 * @param targetLang - Target language code (e.g., 'de', 'en', 'sk')
 * @param sourceLang - Source language code (default: 'sk')
 * @returns Translated text or original if translation fails
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'sk'
): Promise<string> {
  // Skip if same language or empty text
  if (!text || targetLang === sourceLang || targetLang === 'sk') {
    return text;
  }

  // Map our language codes to Google's
  const langMap: Record<string, string> = {
    'de-AT': 'de',
    'sk': 'sk',
    'en': 'en',
  };

  const googleTargetLang = langMap[targetLang] || targetLang;

  // Check cache first
  const cacheKey = `${text}:${sourceLang}:${googleTargetLang}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const apiKey = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ GOOGLE_API_KEY not configured, returning original text');
      return text;
    }

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: sourceLang,
          target: googleTargetLang,
          format: 'text',
        }),
      }
    );

    if (!response.ok) {
      console.error('Translation API error:', await response.text());
      return text;
    }

    const data = await response.json();
    const translatedText = data.data?.translations?.[0]?.translatedText || text;

    // Cache the result
    translationCache.set(cacheKey, translatedText);

    return translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

/**
 * Batch translate multiple texts
 * @param texts - Array of texts to translate
 * @param targetLang - Target language code
 * @param sourceLang - Source language code (default: 'sk')
 * @returns Array of translated texts
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'sk'
): Promise<string[]> {
  // Skip if same language
  if (targetLang === sourceLang || targetLang === 'sk') {
    return texts;
  }

  // Filter out empty texts and already cached
  const langMap: Record<string, string> = {
    'de-AT': 'de',
    'sk': 'sk',
    'en': 'en',
  };
  const googleTargetLang = langMap[targetLang] || targetLang;

  const uncachedTexts: string[] = [];
  const uncachedIndices: number[] = [];
  const results: string[] = [...texts];

  texts.forEach((text, index) => {
    if (!text) {
      results[index] = text;
      return;
    }

    const cacheKey = `${text}:${sourceLang}:${googleTargetLang}`;
    if (translationCache.has(cacheKey)) {
      results[index] = translationCache.get(cacheKey)!;
    } else {
      uncachedTexts.push(text);
      uncachedIndices.push(index);
    }
  });

  // If all were cached, return early
  if (uncachedTexts.length === 0) {
    return results;
  }

  try {
    const apiKey = import.meta.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ GOOGLE_API_KEY not configured, returning original texts');
      return texts;
    }

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: uncachedTexts,
          source: sourceLang,
          target: googleTargetLang,
          format: 'text',
        }),
      }
    );

    if (!response.ok) {
      console.error('Translation API error:', await response.text());
      return texts;
    }

    const data = await response.json();
    const translations = data.data?.translations || [];

    translations.forEach((trans: any, i: number) => {
      const originalText = uncachedTexts[i];
      const translatedText = trans.translatedText || originalText;
      const originalIndex = uncachedIndices[i];
      
      // Cache and store result
      const cacheKey = `${originalText}:${sourceLang}:${googleTargetLang}`;
      translationCache.set(cacheKey, translatedText);
      results[originalIndex] = translatedText;
    });

    return results;
  } catch (error) {
    console.error('Batch translation error:', error);
    return texts;
  }
}
