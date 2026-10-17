"""Language selection for the installed private NER models."""
LANGUAGES = {"en": "en_core_web_sm", "fr": "fr_core_news_sm", "es": "es_core_news_sm", "de": "de_core_news_sm"}


def analysis_languages(text, language, detect_language):
    if language != "auto":
        if language not in LANGUAGES:
            raise ValueError("unsupported_language")
        return [language]
    # Classification of short, mixed or unrecognized text must not disable privacy
    # processing. Union the installed NER models instead of skipping NER.
    if len(text.split()) >= 8:
        try:
            detected = detect_language(text)
            if detected in LANGUAGES:
                return [detected]
        except Exception:
            pass
    return list(LANGUAGES)
