<?php
/**
 * Ability: get-post.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

/**
 * Full post content plus SEO meta.
 */
class SFSA_Ability_Get_Post {

	/**
	 * Register.
	 */
	public static function register() {
		SFSA_Abilities::register(
			'get-post',
			array(
				'label'               => __( 'Get post', 'synapsefabric-seo-abilities' ),
				'description'         => __( 'Full post content (raw block markup), excerpt, taxonomy terms and SEO meta from Yoast SEO or Rank Math when active.', 'synapsefabric-seo-abilities' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'id' => array( 'type' => 'integer', 'minimum' => 1 ),
					),
					'required'   => array( 'id' ),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( __CLASS__, 'execute' ),
				'permission_callback' => array( __CLASS__, 'permission' ),
			)
		);
	}

	/**
	 * Per-post capability check.
	 *
	 * @param array|null $input Input.
	 * @return bool
	 */
	public static function permission( $input = null ) {
		$id = is_array( $input ) ? absint( $input['id'] ?? 0 ) : 0;
		return $id > 0 ? current_user_can( 'edit_post', $id ) : SFSA_Abilities::can_read();
	}

	/**
	 * Run the ability.
	 *
	 * @param array|null $input Input.
	 * @return array|WP_Error
	 */
	public static function execute( $input = null ) {
		$id   = is_array( $input ) ? absint( $input['id'] ?? 0 ) : 0;
		$post = $id ? get_post( $id ) : null;
		if ( ! $post || 'post' !== $post->post_type ) {
			return new WP_Error( 'sfsa_not_found', __( 'Post not found.', 'synapsefabric-seo-abilities' ), array( 'status' => 404 ) );
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'sfsa_forbidden', __( 'You cannot access this post.', 'synapsefabric-seo-abilities' ), array( 'status' => 403 ) );
		}

		return array(
			'id'         => (int) $post->ID,
			'title'      => $post->post_title,
			'slug'       => $post->post_name,
			'status'     => $post->post_status,
			'date'       => get_post_time( 'c', true, $post ),
			'modified'   => get_post_modified_time( 'c', true, $post ),
			'url'        => get_permalink( $post ),
			'excerpt'    => $post->post_excerpt,
			'content'    => $post->post_content,
			'word_count' => SFSA_Abilities::word_count( $post->post_content ),
			'categories' => wp_list_pluck( (array) get_the_category( $post->ID ), 'name' ),
			'tags'       => wp_list_pluck( (array) get_the_tags( $post->ID ), 'name' ),
			'seo'        => SFSA_SEO_Meta::get( $post->ID ),
		);
	}
}
