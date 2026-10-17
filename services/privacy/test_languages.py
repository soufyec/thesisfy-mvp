import unittest
from languages import LANGUAGES, analysis_languages


class LanguageSelectionTests(unittest.TestCase):
    long_text = "one two three four five six seven eight nine"

    def test_supported_detection(self):
        for language in LANGUAGES:
            self.assertEqual(analysis_languages(self.long_text, "auto", lambda _: language), [language])

    def test_uninstalled_detection_still_runs_all_installed_models(self):
        self.assertEqual(analysis_languages(self.long_text, "auto", lambda _: "pt"), list(LANGUAGES))

    def test_detection_failure_still_runs_all_models(self):
        def fail(_):
            raise ValueError("no features")
        self.assertEqual(analysis_languages(self.long_text, "auto", fail), list(LANGUAGES))

    def test_short_text_does_not_use_unreliable_detection(self):
        def unexpected(_):
            self.fail("short text should not be classified")
        self.assertEqual(analysis_languages("Hola", "auto", unexpected), list(LANGUAGES))

    def test_explicit_language_is_preserved_and_validated(self):
        self.assertEqual(analysis_languages("Bonjour", "fr", None), ["fr"])
        with self.assertRaisesRegex(ValueError, "unsupported_language"):
            analysis_languages(self.long_text, "pt", None)


if __name__ == "__main__":
    unittest.main()
