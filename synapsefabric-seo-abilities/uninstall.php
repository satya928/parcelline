<?php
/**
 * Removes all plugin data on uninstall.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

delete_option( 'sfsa_settings' );
delete_site_option( 'sfsa_settings' );

// Redirect table (created by the merge-posts ability, if it was ever used).
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sfsa_redirects" );
delete_option( 'sfsa_db_version' );
