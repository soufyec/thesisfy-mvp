import type { Messages } from "../index";

/**
 * Server messages of the personal library of sources and references (`/api/library/*`, `/api/theses/[id]/sources/*`).
 * A source is full text the assistant can quote; a reference is a bibliographic entry. "Your library" is the student's
 * personal base; the university's research databases page (/dashboard/library) is unrelated.
 * Spanish uses "tú"; French "vous"; German "Sie". No exclamation marks.
 */
const en = {
  // Access
  "library.error.thesisNotFound": "Thesis not found.",
  "library.error.sourceNotFound": "Source not found.",
  "library.error.referenceNotFound": "Reference not found.",
  "library.error.ownerOnly": "Only the student who owns this thesis can change its sources and references.",
  "library.error.studentsOnly": "Only students have a library of sources and references. You can view the items linked to a thesis from its page.",
  "library.error.invalidBody": "The request could not be read.",
  "library.error.thesisIds": "Choose theses from your own list.",

  // Links
  "library.error.locked": "“{title}” is approved or submitted, so its sources and references can no longer change.",
  "library.error.thesisCap": "A thesis can use up to {max} sources. Remove one from “{title}” before adding another.",
  "library.error.libraryCap": "Your library holds up to {max} sources. Delete one before adding another.",
  "library.error.alreadyLinked": "This DOI is already among the sources of this thesis.",
  "library.error.idConflict": "“{title}” already has a different reference with the same identifier.",
  "library.error.cited": "This reference is cited in the text. Confirm to remove it: those citations will be left without an entry in the bibliography.",

  // Adding a source
  "library.error.attachPdf": "Attach a PDF in the file field.",
  "library.error.pdfTooLarge": "The PDF is larger than 15 MB.",
  "library.error.pdfOnly": "Only PDF files can be added.",
  "library.error.kindValue": "Choose a kind of source and enter a value.",
  "library.error.kindInvalid": "The kind must be doi, url or text. Upload PDFs as a file.",
  "library.error.doiInvalid": "That does not look like a DOI (expected 10.xxxx/…).",
  "library.error.urlInvalid": "Enter a full URL starting with http:// or https://.",
  "library.error.urlProtocol": "Only http and https URLs can be added.",
  "library.error.textTooShort": "Paste at least 20 words of text.",
  "library.error.titleEmpty": "The title cannot be empty.",

  // Adding a reference
  "library.error.doiNotFound": "No record was found for this DOI. Check it, or add the reference by hand.",
  "library.error.referenceTitle": "Add a title for the reference.",

  // Status stored on a source when its text could not be indexed
  "library.source.uploadedPdf": "Uploaded PDF",
  "library.source.lookupFailed": "Lookup failed: {reason}",
  "library.source.doiNotFound": "DOI not found in OpenAlex or Crossref.",
  "library.source.urlFailed": "The page could not be fetched (private address, blocked, or not found).",
  "library.source.extractionFailed": "The text could not be extracted.",

  // ---------- Uploaded files and primary data (data-backend, docs/papers.md §3.3) ----------
  "library.error.attachFile": "Attach a file in the file field.",
  "library.error.tooLarge": "Files can be up to {max} MB. Split the file or remove what you do not need, then upload it again.",
  "library.error.expandsTooLarge": "This file holds more data than Thesisfic can read. Split it into smaller files and upload them separately.",
  "library.error.legacyFormat": "This file uses an older format that Thesisfic does not read. Save it as .xlsx, .docx or .csv, then upload it again.",
  "library.error.unsupportedType": "Thesisfic reads PDF, Word (.docx), Excel (.xlsx), CSV, TSV, plain text (.txt) and Markdown (.md) files. Check that the file name ends with the right extension.",
  "library.error.encrypted": "This file is protected with a password. Save a copy without the password, then upload it.",
  "library.error.empty": "This file is empty.",
  "library.error.noRows": "Thesisfic found no rows of data in this file.",
  "library.error.noText": "Thesisfic found no text in this file.",
  "library.error.unreadable": "This file could not be read. Check that it opens on your computer, save it again, then upload it.",
  "library.error.roleInvalid": "The role must be primary or secondary.",
  "library.error.primaryThesisCap": "A paper can use up to {max} primary sources. Remove one from “{title}” before adding another.",
  "library.error.primaryLibraryCap": "Your library holds up to {max} primary sources. Delete one before adding another.",
  "library.error.dataCap": "Your library holds up to {max} cells of data. Delete a data file you no longer use before adding another.",
  "library.error.noData": "This source has no data table.",
  "library.error.sheetNotFound": "This sheet is not in the file.",
  "library.source.uploadedFile": "Uploaded file",
  // ---------- end of uploaded files and primary data ----------
};

export const library: Messages<typeof en> = {
  en,
  es: {
    "library.error.thesisNotFound": "No se encontró la tesis.",
    "library.error.sourceNotFound": "No se encontró la fuente.",
    "library.error.referenceNotFound": "No se encontró la referencia.",
    "library.error.ownerOnly": "Solo el estudiante dueño de esta tesis puede cambiar sus fuentes y referencias.",
    "library.error.studentsOnly": "Solo los estudiantes tienen una biblioteca de fuentes y referencias. Puedes ver los elementos vinculados a una tesis desde su página.",
    "library.error.invalidBody": "No se pudo leer la solicitud.",
    "library.error.thesisIds": "Elige tesis de tu propia lista.",

    "library.error.locked": "«{title}» está aprobada o entregada, así que sus fuentes y referencias ya no pueden cambiar.",
    "library.error.thesisCap": "Una tesis puede usar hasta {max} fuentes. Quita una de «{title}» antes de añadir otra.",
    "library.error.libraryCap": "Tu biblioteca admite hasta {max} fuentes. Elimina una antes de añadir otra.",
    "library.error.alreadyLinked": "Este DOI ya está entre las fuentes de esta tesis.",
    "library.error.idConflict": "«{title}» ya tiene otra referencia con el mismo identificador.",
    "library.error.cited": "Esta referencia está citada en el texto. Confirma para quitarla: esas citas se quedarán sin entrada en la bibliografía.",

    "library.error.attachPdf": "Adjunta un PDF en el campo de archivo.",
    "library.error.pdfTooLarge": "El PDF ocupa más de 15 MB.",
    "library.error.pdfOnly": "Solo se pueden añadir archivos PDF.",
    "library.error.kindValue": "Elige un tipo de fuente e introduce un valor.",
    "library.error.kindInvalid": "El tipo debe ser doi, url o text. Sube los PDF como archivo.",
    "library.error.doiInvalid": "Eso no parece un DOI (se espera 10.xxxx/…).",
    "library.error.urlInvalid": "Introduce una URL completa que empiece por http:// o https://.",
    "library.error.urlProtocol": "Solo se pueden añadir URL http y https.",
    "library.error.textTooShort": "Pega al menos 20 palabras de texto.",
    "library.error.titleEmpty": "El título no puede estar vacío.",

    "library.error.doiNotFound": "No se encontró ningún registro para este DOI. Revísalo o añade la referencia a mano.",
    "library.error.referenceTitle": "Añade un título a la referencia.",

    "library.source.uploadedPdf": "PDF subido",
    "library.source.lookupFailed": "La búsqueda falló: {reason}",
    "library.source.doiNotFound": "El DOI no aparece en OpenAlex ni en Crossref.",
    "library.source.urlFailed": "No se pudo obtener la página (dirección privada, bloqueada o inexistente).",
    "library.source.extractionFailed": "No se pudo extraer el texto.",

    // ---------- Uploaded files and primary data (data-backend) ----------
    "library.error.attachFile": "Adjunta un archivo en el campo de archivo.",
    "library.error.tooLarge": "Los archivos pueden ocupar hasta {max} MB. Divide el archivo o quita lo que no necesites y vuelve a subirlo.",
    "library.error.expandsTooLarge": "Este archivo contiene más datos de los que Thesisfic puede leer. Divídelo en archivos más pequeños y súbelos por separado.",
    "library.error.legacyFormat": "Este archivo usa un formato antiguo que Thesisfic no lee. Guárdalo como .xlsx, .docx o .csv y vuelve a subirlo.",
    "library.error.unsupportedType": "Thesisfic lee archivos PDF, Word (.docx), Excel (.xlsx), CSV, TSV, texto plano (.txt) y Markdown (.md). Comprueba que el nombre del archivo termine en la extensión correcta.",
    "library.error.encrypted": "Este archivo está protegido con contraseña. Guarda una copia sin contraseña y súbela.",
    "library.error.empty": "Este archivo está vacío.",
    "library.error.noRows": "Thesisfic no encontró filas de datos en este archivo.",
    "library.error.noText": "Thesisfic no encontró texto en este archivo.",
    "library.error.unreadable": "No se pudo leer este archivo. Comprueba que se abre en tu ordenador, vuelve a guardarlo y súbelo de nuevo.",
    "library.error.roleInvalid": "El rol debe ser primary o secondary.",
    "library.error.primaryThesisCap": "Un trabajo puede usar hasta {max} fuentes primarias. Quita una de «{title}» antes de añadir otra.",
    "library.error.primaryLibraryCap": "Tu biblioteca admite hasta {max} fuentes primarias. Elimina una antes de añadir otra.",
    "library.error.dataCap": "Tu biblioteca admite hasta {max} celdas de datos. Elimina un archivo de datos que ya no uses antes de añadir otro.",
    "library.error.noData": "Esta fuente no tiene tabla de datos.",
    "library.error.sheetNotFound": "Esta hoja no está en el archivo.",
    "library.source.uploadedFile": "Archivo subido",
    // ---------- end of uploaded files and primary data ----------
  },
  fr: {
    "library.error.thesisNotFound": "Thèse introuvable.",
    "library.error.sourceNotFound": "Source introuvable.",
    "library.error.referenceNotFound": "Référence introuvable.",
    "library.error.ownerOnly": "Seul l'étudiant propriétaire de cette thèse peut modifier ses sources et références.",
    "library.error.studentsOnly": "Seuls les étudiants disposent d'une bibliothèque de sources et de références. Vous pouvez consulter les éléments liés à une thèse depuis sa page.",
    "library.error.invalidBody": "La requête n'a pas pu être lue.",
    "library.error.thesisIds": "Choisissez des thèses dans votre propre liste.",

    "library.error.locked": "« {title} » est approuvée ou déposée : ses sources et références ne peuvent plus changer.",
    "library.error.thesisCap": "Une thèse peut utiliser jusqu'à {max} sources. Retirez-en une de « {title} » avant d'en ajouter une autre.",
    "library.error.libraryCap": "Votre bibliothèque contient au plus {max} sources. Supprimez-en une avant d'en ajouter une autre.",
    "library.error.alreadyLinked": "Ce DOI fait déjà partie des sources de cette thèse.",
    "library.error.idConflict": "« {title} » contient déjà une autre référence avec le même identifiant.",
    "library.error.cited": "Cette référence est citée dans le texte. Confirmez pour la retirer : ces citations resteront sans entrée dans la bibliographie.",

    "library.error.attachPdf": "Joignez un PDF dans le champ fichier.",
    "library.error.pdfTooLarge": "Le PDF dépasse 15 Mo.",
    "library.error.pdfOnly": "Seuls les fichiers PDF peuvent être ajoutés.",
    "library.error.kindValue": "Choisissez un type de source et saisissez une valeur.",
    "library.error.kindInvalid": "Le type doit être doi, url ou text. Envoyez les PDF en tant que fichier.",
    "library.error.doiInvalid": "Cela ne ressemble pas à un DOI (format attendu 10.xxxx/…).",
    "library.error.urlInvalid": "Saisissez une URL complète commençant par http:// ou https://.",
    "library.error.urlProtocol": "Seules les URL http et https peuvent être ajoutées.",
    "library.error.textTooShort": "Collez au moins 20 mots de texte.",
    "library.error.titleEmpty": "Le titre ne peut pas être vide.",

    "library.error.doiNotFound": "Aucune notice trouvée pour ce DOI. Vérifiez-le ou ajoutez la référence à la main.",
    "library.error.referenceTitle": "Ajoutez un titre à la référence.",

    "library.source.uploadedPdf": "PDF importé",
    "library.source.lookupFailed": "La recherche a échoué : {reason}",
    "library.source.doiNotFound": "DOI introuvable dans OpenAlex et Crossref.",
    "library.source.urlFailed": "La page n'a pas pu être récupérée (adresse privée, bloquée ou introuvable).",
    "library.source.extractionFailed": "Le texte n'a pas pu être extrait.",

    // ---------- Uploaded files and primary data (data-backend) ----------
    "library.error.attachFile": "Joignez un fichier dans le champ fichier.",
    "library.error.tooLarge": "Les fichiers peuvent peser jusqu'à {max} Mo. Divisez le fichier ou retirez ce dont vous n'avez pas besoin, puis importez-le à nouveau.",
    "library.error.expandsTooLarge": "Ce fichier contient plus de données que Thesisfic ne peut en lire. Divisez-le en fichiers plus petits et importez-les séparément.",
    "library.error.legacyFormat": "Ce fichier utilise un ancien format que Thesisfic ne lit pas. Enregistrez-le au format .xlsx, .docx ou .csv, puis importez-le à nouveau.",
    "library.error.unsupportedType": "Thesisfic lit les fichiers PDF, Word (.docx), Excel (.xlsx), CSV, TSV, texte brut (.txt) et Markdown (.md). Vérifiez que le nom du fichier se termine par la bonne extension.",
    "library.error.encrypted": "Ce fichier est protégé par un mot de passe. Enregistrez une copie sans mot de passe, puis importez-la.",
    "library.error.empty": "Ce fichier est vide.",
    "library.error.noRows": "Thesisfic n'a trouvé aucune ligne de données dans ce fichier.",
    "library.error.noText": "Thesisfic n'a trouvé aucun texte dans ce fichier.",
    "library.error.unreadable": "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'ouvre sur votre ordinateur, enregistrez-le à nouveau, puis importez-le.",
    "library.error.roleInvalid": "Le rôle doit être primary ou secondary.",
    "library.error.primaryThesisCap": "Un travail peut utiliser jusqu'à {max} sources primaires. Retirez-en une de « {title} » avant d'en ajouter une autre.",
    "library.error.primaryLibraryCap": "Votre bibliothèque contient au plus {max} sources primaires. Supprimez-en une avant d'en ajouter une autre.",
    "library.error.dataCap": "Votre bibliothèque contient au plus {max} cellules de données. Supprimez un fichier de données que vous n'utilisez plus avant d'en ajouter un autre.",
    "library.error.noData": "Cette source n'a pas de tableau de données.",
    "library.error.sheetNotFound": "Cette feuille ne figure pas dans le fichier.",
    "library.source.uploadedFile": "Fichier importé",
    // ---------- end of uploaded files and primary data ----------
  },
  de: {
    "library.error.thesisNotFound": "Abschlussarbeit nicht gefunden.",
    "library.error.sourceNotFound": "Quelle nicht gefunden.",
    "library.error.referenceNotFound": "Literaturangabe nicht gefunden.",
    "library.error.ownerOnly": "Nur die Studierenden, denen diese Abschlussarbeit gehört, können ihre Quellen und Literatur ändern.",
    "library.error.studentsOnly": "Nur Studierende haben eine Bibliothek mit Quellen und Literatur. Die mit einer Abschlussarbeit verknüpften Einträge sehen Sie auf deren Seite.",
    "library.error.invalidBody": "Die Anfrage konnte nicht gelesen werden.",
    "library.error.thesisIds": "Wählen Sie Abschlussarbeiten aus Ihrer eigenen Liste.",

    "library.error.locked": "„{title}“ ist genehmigt oder abgegeben, daher können sich ihre Quellen und Literatur nicht mehr ändern.",
    "library.error.thesisCap": "Eine Abschlussarbeit kann bis zu {max} Quellen verwenden. Entfernen Sie eine aus „{title}“, bevor Sie eine weitere hinzufügen.",
    "library.error.libraryCap": "Ihre Bibliothek fasst bis zu {max} Quellen. Löschen Sie eine, bevor Sie eine weitere hinzufügen.",
    "library.error.alreadyLinked": "Diese DOI gehört bereits zu den Quellen dieser Abschlussarbeit.",
    "library.error.idConflict": "„{title}“ enthält bereits eine andere Literaturangabe mit derselben Kennung.",
    "library.error.cited": "Diese Literaturangabe wird im Text zitiert. Bestätigen Sie das Entfernen: Diese Zitate haben danach keinen Eintrag im Literaturverzeichnis.",

    "library.error.attachPdf": "Hängen Sie eine PDF-Datei im Dateifeld an.",
    "library.error.pdfTooLarge": "Die PDF-Datei ist größer als 15 MB.",
    "library.error.pdfOnly": "Es können nur PDF-Dateien hinzugefügt werden.",
    "library.error.kindValue": "Wählen Sie eine Quellenart und geben Sie einen Wert ein.",
    "library.error.kindInvalid": "Die Art muss doi, url oder text sein. Laden Sie PDF-Dateien als Datei hoch.",
    "library.error.doiInvalid": "Das sieht nicht nach einer DOI aus (erwartet: 10.xxxx/…).",
    "library.error.urlInvalid": "Geben Sie eine vollständige URL ein, die mit http:// oder https:// beginnt.",
    "library.error.urlProtocol": "Es können nur http- und https-URLs hinzugefügt werden.",
    "library.error.textTooShort": "Fügen Sie mindestens 20 Wörter Text ein.",
    "library.error.titleEmpty": "Der Titel darf nicht leer sein.",

    "library.error.doiNotFound": "Zu dieser DOI wurde kein Eintrag gefunden. Prüfen Sie sie oder fügen Sie die Literaturangabe manuell hinzu.",
    "library.error.referenceTitle": "Geben Sie der Literaturangabe einen Titel.",

    "library.source.uploadedPdf": "Hochgeladene PDF",
    "library.source.lookupFailed": "Die Suche ist fehlgeschlagen: {reason}",
    "library.source.doiNotFound": "DOI weder in OpenAlex noch in Crossref gefunden.",
    "library.source.urlFailed": "Die Seite konnte nicht abgerufen werden (private Adresse, gesperrt oder nicht gefunden).",
    "library.source.extractionFailed": "Der Text konnte nicht extrahiert werden.",

    // ---------- Uploaded files and primary data (data-backend) ----------
    "library.error.attachFile": "Hängen Sie eine Datei im Dateifeld an.",
    "library.error.tooLarge": "Dateien dürfen bis zu {max} MB groß sein. Teilen Sie die Datei auf oder entfernen Sie, was Sie nicht brauchen, und laden Sie sie erneut hoch.",
    "library.error.expandsTooLarge": "Diese Datei enthält mehr Daten, als Thesisfic lesen kann. Teilen Sie sie in kleinere Dateien auf und laden Sie diese einzeln hoch.",
    "library.error.legacyFormat": "Diese Datei hat ein älteres Format, das Thesisfic nicht liest. Speichern Sie sie als .xlsx, .docx oder .csv und laden Sie sie erneut hoch.",
    "library.error.unsupportedType": "Thesisfic liest PDF-, Word- (.docx), Excel- (.xlsx), CSV-, TSV-, Text- (.txt) und Markdown-Dateien (.md). Prüfen Sie, ob der Dateiname die richtige Endung hat.",
    "library.error.encrypted": "Diese Datei ist mit einem Passwort geschützt. Speichern Sie eine Kopie ohne Passwort und laden Sie diese hoch.",
    "library.error.empty": "Diese Datei ist leer.",
    "library.error.noRows": "Thesisfic hat in dieser Datei keine Datenzeilen gefunden.",
    "library.error.noText": "Thesisfic hat in dieser Datei keinen Text gefunden.",
    "library.error.unreadable": "Diese Datei konnte nicht gelesen werden. Prüfen Sie, ob sie sich auf Ihrem Computer öffnen lässt, speichern Sie sie erneut und laden Sie sie dann hoch.",
    "library.error.roleInvalid": "Die Rolle muss primary oder secondary sein.",
    "library.error.primaryThesisCap": "Eine Arbeit kann bis zu {max} Primärquellen verwenden. Entfernen Sie eine aus „{title}“, bevor Sie eine weitere hinzufügen.",
    "library.error.primaryLibraryCap": "Ihre Bibliothek fasst bis zu {max} Primärquellen. Löschen Sie eine, bevor Sie eine weitere hinzufügen.",
    "library.error.dataCap": "Ihre Bibliothek fasst bis zu {max} Datenzellen. Löschen Sie eine Datendatei, die Sie nicht mehr verwenden, bevor Sie eine weitere hinzufügen.",
    "library.error.noData": "Diese Quelle hat keine Datentabelle.",
    "library.error.sheetNotFound": "Dieses Tabellenblatt ist nicht in der Datei.",
    "library.source.uploadedFile": "Hochgeladene Datei",
    // ---------- end of uploaded files and primary data ----------
  },
};
