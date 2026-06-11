<?php
/**
 * Menap API — api.php  v3.0
 *
 * Stockage centralisé de menap.db sur le serveur PHP.
 * Accessible depuis n'importe quel navigateur / pays.
 *
 * GET  api.php              → télécharge data/menap.db (binaire SQLite)
 * GET  api.php?action=version → retourne {ts, size} pour le polling temps réel
 * POST api.php              → reçoit le binaire et écrase data/menap.db
 *
 * Changelog v3.0 :
 *  - Endpoint ?action=version pour polling temps réel côté client
 *  - En-têtes ETag + Last-Modified pour cache HTTP optimal
 *  - Sync forcée dès que la connexion est rétablie (online event)
 *  - Prise en charge paiements par membre + part calculée
 *  - Gestion rôles : gestionnaire / membre (lecture seule)
 *  - Transfert de privilèges + quitter le ménage
 */

/* ── CORS : autoriser les requêtes depuis le navigateur ── */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Menap-Token');

/* Répondre au preflight OPTIONS immédiatement */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/* ── Token de sécurité (optionnel) ──────────────────────────
 * Définir un token secret pour empêcher des inconnus d'écraser la base.
 * Laisser vide ('') pour désactiver la protection.
 * Changer la même valeur dans db.js : const MENAP_TOKEN = '...';
 * ─────────────────────────────────────────────────────────── */
define('MENAP_TOKEN', '');

/* ── Chemin du fichier de base de données ── */
$dbPath = __DIR__ . '/data/menap.db';

/* ── Vérification du token si configuré ── */
function checkToken() {
    if (MENAP_TOKEN === '') return; /* protection désactivée */
    $sent = $_SERVER['HTTP_X_MENAP_TOKEN'] ?? '';
    if ($sent !== MENAP_TOKEN) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Token invalide']);
        exit;
    }
}

/* ════════════════════════════════════════
   GET — Endpoint version OU télécharger menap.db
   ════════════════════════════════════════ */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    /* ── ?action=version : retourne {ts, size} pour le polling temps réel ── */
    $action = isset($_GET['action']) ? $_GET['action'] : '';
    if ($action === 'version') {
        /* Pas de vérification token ici pour permettre les polls légers */
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache');
        $ts   = file_exists($dbPath) ? filemtime($dbPath) : 0;
        $size = file_exists($dbPath) ? filesize($dbPath)  : 0;
        echo json_encode(['ts' => $ts, 'size' => $size]);
        exit;
    }

    checkToken();

    if (!file_exists($dbPath) || filesize($dbPath) < 100) {
        /* Pas encore de base sur le serveur → 204 No Content
           Le client créera une base vide */
        http_response_code(204);
        exit;
    }

    $ts   = filemtime($dbPath);
    $etag = '"' . $ts . '-' . filesize($dbPath) . '"';
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="menap.db"');
    header('Content-Length: ' . filesize($dbPath));
    header('Cache-Control: no-store, no-cache');
    header('Pragma: no-cache');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $ts) . ' GMT');
    readfile($dbPath);
    exit;
}

/* ════════════════════════════════════════
   POST — Sauvegarder menap.db
   ════════════════════════════════════════ */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    checkToken();

    $body = file_get_contents('php://input');

    /* Validation taille minimale */
    if (!$body || strlen($body) < 100) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Corps trop petit ou vide']);
        exit;
    }

    /* Validation magic bytes SQLite3 : "SQLite format 3\000" */
    if (substr($body, 0, 6) !== 'SQLite') {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Fichier SQLite invalide']);
        exit;
    }

    /* Créer le dossier data/ si nécessaire */
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    /* Écriture atomique avec verrou exclusif */
    $tmpPath = $dbPath . '.tmp';
    $written = file_put_contents($tmpPath, $body, LOCK_EX);

    if ($written === false) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Impossible d\'écrire le fichier. Vérifier les permissions du dossier data/']);
        exit;
    }

    /* Remplacement atomique */
    rename($tmpPath, $dbPath);

    header('Content-Type: application/json');
    echo json_encode([
        'ok'    => true,
        'bytes' => $written,
        'time'  => date('c'),
    ]);
    exit;
}

/* Méthode non supportée */
http_response_code(405);
header('Content-Type: application/json');
echo json_encode(['error' => 'Méthode non supportée']);
