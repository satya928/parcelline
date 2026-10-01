<?php
/**
 * Ability: find-duplicates.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

/**
 * Groups similar posts by title and content.
 */
class SFSA_Ability_Find_Duplicates {

	const MAX_POSTS = 2000;

	/**
	 * Register.
	 */
	public static function register() {
		SFSA_Abilities::register(
			'find-duplicates',
			array(
				'label'               => __( 'Find duplicate posts', 'synapsefabric-seo-abilities' ),
				'description'         => __( 'Groups posts with similar titles/content (3-word shingles, Jaccard). Returns groups with per-pair title, content and combined similarity (0-1). Read-only.', 'synapsefabric-seo-abilities' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'threshold' => array( 'type' => 'number', 'minimum' => 0.1, 'maximum' => 1, 'default' => 0.5, 'description' => 'Minimum combined score for two posts to be linked. Lower finds more, looser matches.' ),
						'status'    => array( 'type' => 'string', 'enum' => array( 'any', 'publish', 'draft', 'pending', 'private', 'future' ), 'default' => 'publish' ),
						'limit'     => array( 'type' => 'integer', 'minimum' => 2, 'maximum' => self::MAX_POSTS, 'default' => 1000, 'description' => 'Max posts to scan (most recent first).' ),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( __CLASS__, 'execute' ),
				'permission_callback' => array( 'SFSA_Abilities', 'can_read' ),
			)
		);
	}

	/**
	 * Run the ability.
	 *
	 * @param array|null $input Input.
	 * @return array
	 */
	public static function execute( $input = null ) {
		$input     = is_array( $input ) ? $input : array();
		$threshold = min( 1.0, max( 0.1, (float) ( $input['threshold'] ?? 0.5 ) ) );
		$limit     = min( self::MAX_POSTS, max( 2, (int) ( $input['limit'] ?? 1000 ) ) );
		$status    = sanitize_key( $input['status'] ?? 'publish' );
		$allowed   = array( 'any', 'publish', 'draft', 'pending', 'private', 'future' );

		$query = new WP_Query(
			array(
				'post_type'              => 'post',
				'post_status'            => in_array( $status, $allowed, true ) ? $status : 'publish',
				'posts_per_page'         => $limit,
				'orderby'                => 'date',
				'order'                  => 'DESC',
				'perm'                   => 'editable',
				'update_post_term_cache' => false,
				'update_post_meta_cache' => false,
			)
		);

		$docs   = array();
		$posts  = array();
		foreach ( $query->posts as $post ) {
			$docs[ $post->ID ]  = array(
				'title'   => $post->post_title,
				'content' => $post->post_content,
			);
			$posts[ $post->ID ] = $post;
		}

		$groups = array();
		foreach ( SFSA_Similarity::find_groups( $docs, $threshold ) as $group ) {
			$members = array();
			foreach ( $group['ids'] as $id ) {
				$members[] = array(
					'id'         => (int) $id,
					'title'      => get_the_title( $posts[ $id ] ),
					'slug'       => $posts[ $id ]->post_name,
					'status'     => $posts[ $id ]->post_status,
					'date'       => get_post_time( 'c', true, $posts[ $id ] ),
					'word_count' => SFSA_Abilities::word_count( $posts[ $id ]->post_content ),
					'url'        => get_permalink( $posts[ $id ] ),
				);
			}
			$pairs = array();
			foreach ( $group['pairs'] as $pair ) {
				$pairs[] = array(
					'post_a'             => $pair['a'],
					'post_b'             => $pair['b'],
					'similarity'         => $pair['score'],
					'content_similarity' => $pair['content_similarity'],
					'title_similarity'   => $pair['title_similarity'],
				);
			}
			$groups[] = array(
				'max_similarity' => $group['max_score'],
				'posts'          => $members,
				'pairs'          => $pairs,
			);
		}

		return array(
			'scanned'   => count( $docs ),
			'truncated' => (int) $query->found_posts > count( $docs ),
			'threshold' => $threshold,
			'groups'    => $groups,
		);
	}
}
