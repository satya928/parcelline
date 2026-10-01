<?php
/**
 * Ability: list-posts.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

/**
 * Paginated post listing.
 */
class SFSA_Ability_List_Posts {

	/**
	 * Register.
	 */
	public static function register() {
		SFSA_Abilities::register(
			'list-posts',
			array(
				'label'               => __( 'List posts', 'synapsefabric-seo-abilities' ),
				'description'         => __( 'Paginated list of posts with id, title, slug, date, word count, categories, tags and status.', 'synapsefabric-seo-abilities' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'page'     => array( 'type' => 'integer', 'minimum' => 1, 'default' => 1 ),
						'per_page' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 20 ),
						'status'   => array( 'type' => 'string', 'enum' => array( 'any', 'publish', 'draft', 'pending', 'private', 'future' ), 'default' => 'publish' ),
						'search'   => array( 'type' => 'string' ),
						'category' => array( 'type' => 'integer', 'description' => 'Category term ID.' ),
						'orderby'  => array( 'type' => 'string', 'enum' => array( 'date', 'title', 'modified' ), 'default' => 'date' ),
						'order'    => array( 'type' => 'string', 'enum' => array( 'ASC', 'DESC' ), 'default' => 'DESC' ),
					),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'posts'       => array( 'type' => 'array' ),
						'total'       => array( 'type' => 'integer' ),
						'total_pages' => array( 'type' => 'integer' ),
						'page'        => array( 'type' => 'integer' ),
					),
				),
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
		$input    = is_array( $input ) ? $input : array();
		$page     = max( 1, (int) ( $input['page'] ?? 1 ) );
		$per_page = min( 100, max( 1, (int) ( $input['per_page'] ?? 20 ) ) );
		$order    = ( isset( $input['order'] ) && 'ASC' === strtoupper( $input['order'] ) ) ? 'ASC' : 'DESC';
		$orderby  = in_array( $input['orderby'] ?? 'date', array( 'date', 'title', 'modified' ), true ) ? $input['orderby'] : 'date';
		$status   = sanitize_key( $input['status'] ?? 'publish' );
		$allowed  = array( 'any', 'publish', 'draft', 'pending', 'private', 'future' );

		$args = array(
			'post_type'      => 'post',
			'post_status'    => in_array( $status, $allowed, true ) ? $status : 'publish',
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'orderby'        => $orderby,
			'order'          => $order,
			'perm'           => 'editable',
		);
		if ( ! empty( $input['search'] ) ) {
			$args['s'] = sanitize_text_field( $input['search'] );
		}
		if ( ! empty( $input['category'] ) ) {
			$args['cat'] = absint( $input['category'] );
		}

		$query = new WP_Query( $args );
		$posts = array();
		foreach ( $query->posts as $post ) {
			$posts[] = array(
				'id'         => (int) $post->ID,
				'title'      => get_the_title( $post ),
				'slug'       => $post->post_name,
				'date'       => get_post_time( 'c', true, $post ),
				'word_count' => SFSA_Abilities::word_count( $post->post_content ),
				'categories' => wp_list_pluck( (array) get_the_category( $post->ID ), 'name' ),
				'tags'       => wp_list_pluck( (array) get_the_tags( $post->ID ), 'name' ),
				'status'     => $post->post_status,
				'url'        => get_permalink( $post ),
			);
		}

		return array(
			'posts'       => $posts,
			'total'       => (int) $query->found_posts,
			'total_pages' => (int) $query->max_num_pages,
			'page'        => $page,
		);
	}
}
