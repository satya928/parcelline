<?php
/**
 * Registers abilities with the core Abilities API (exposed via the MCP Adapter).
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

/**
 * Ability registrar.
 */
class SFSA_Abilities {

	const NS       = 'synapsefabric-seo';
	const CATEGORY = 'synapsefabric-seo';

	/**
	 * Hook into the Abilities API.
	 */
	public static function init() {
		add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( __CLASS__, 'register_abilities' ) );
	}

	/**
	 * Register the ability category.
	 */
	public static function register_category() {
		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'SynapseFabric SEO', 'synapsefabric-seo-abilities' ),
				'description' => __( 'Audit and improve blog content.', 'synapsefabric-seo-abilities' ),
			)
		);
	}

	/**
	 * Register every ability. Write abilities are registered only when enabled in settings.
	 */
	public static function register_abilities() {
		require_once SFSA_DIR . 'includes/abilities/class-sfsa-ability-list-posts.php';
		require_once SFSA_DIR . 'includes/abilities/class-sfsa-ability-get-post.php';
		require_once SFSA_DIR . 'includes/abilities/class-sfsa-ability-find-duplicates.php';

		SFSA_Ability_List_Posts::register();
		SFSA_Ability_Get_Post::register();
		SFSA_Ability_Find_Duplicates::register();
	}

	/**
	 * Shared registration wrapper: namespace, category, MCP exposure, REST visibility.
	 *
	 * @param string $slug Ability slug without namespace.
	 * @param array  $args Ability args (label, description, schemas, callbacks, optional annotations).
	 * @param bool   $readonly Whether the ability only reads data.
	 */
	public static function register( $slug, array $args, $readonly = true ) {
		$args['category'] = self::CATEGORY;
		$args['meta']     = array(
			'show_in_rest' => true,
			'mcp'          => array( 'public' => true ),
			'annotations'  => array(
				'readonly'    => $readonly,
				'destructive' => false,
				'idempotent'  => $readonly,
			),
		);
		wp_register_ability( self::NS . '/' . $slug, $args );
	}

	/**
	 * Capability gate for read abilities.
	 *
	 * @return bool
	 */
	public static function can_read() {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * Word count that works for non-Latin scripts and ignores markup.
	 *
	 * @param string $content Post content.
	 * @return int
	 */
	public static function word_count( $content ) {
		return count( SFSA_Similarity::tokens( $content ) );
	}
}
