<?php
/**
 * Plugin Name:       SynapseFabric SEO Abilities
 * Description:       Exposes blog audit and content-management abilities to Claude through the WordPress MCP Adapter and the core Abilities API.
 * Version:           0.1.0
 * Requires at least: 6.9
 * Requires PHP:      7.4
 * Requires Plugins:  mcp-adapter
 * Author:            SynapseFabric
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       synapsefabric-seo-abilities
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

define( 'SFSA_VERSION', '0.1.0' );
define( 'SFSA_DIR', plugin_dir_path( __FILE__ ) );

require_once SFSA_DIR . 'includes/class-sfsa-settings.php';
require_once SFSA_DIR . 'includes/class-sfsa-similarity.php';
require_once SFSA_DIR . 'includes/class-sfsa-seo-meta.php';
require_once SFSA_DIR . 'includes/class-sfsa-abilities.php';

SFSA_Settings::init();
SFSA_Abilities::init();
