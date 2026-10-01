<?php
/**
 * Settings screen and feature gating for write abilities.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings (Settings > SynapseFabric SEO). Write abilities are off by default.
 */
class SFSA_Settings {

	const OPTION = 'sfsa_settings';
	const PAGE   = 'sfsa-settings';

	/**
	 * Write abilities that can be switched on, slug => label.
	 *
	 * @return array<string,string>
	 */
	public static function write_abilities() {
		return array(
			'update-post'  => __( 'update-post: edit content, title, excerpt and SEO meta (saves a revision)', 'synapsefabric-seo-abilities' ),
			'merge-posts'  => __( 'merge-posts: draft a source post and 301-redirect it to a target', 'synapsefabric-seo-abilities' ),
			'create-draft' => __( 'create-draft: create new posts as drafts only', 'synapsefabric-seo-abilities' ),
		);
	}

	/**
	 * Whether a write ability has been enabled by an administrator.
	 *
	 * @param string $slug Ability slug without namespace.
	 * @return bool
	 */
	public static function is_write_enabled( $slug ) {
		$settings = get_option( self::OPTION, array() );
		return ! empty( $settings['write_abilities'][ $slug ] );
	}

	/**
	 * Hook into WordPress.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_page' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
	}

	/**
	 * Add the settings page.
	 */
	public static function add_page() {
		add_options_page(
			__( 'SynapseFabric SEO Abilities', 'synapsefabric-seo-abilities' ),
			__( 'SynapseFabric SEO', 'synapsefabric-seo-abilities' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * Register the option (the Settings API adds the nonce and capability check).
	 */
	public static function register() {
		register_setting(
			self::PAGE,
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => array( 'write_abilities' => array() ),
			)
		);
	}

	/**
	 * Sanitise submitted settings; unknown keys are dropped.
	 *
	 * @param mixed $input Raw input.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$clean = array( 'write_abilities' => array() );
		$input = is_array( $input ) ? $input : array();
		$posted = isset( $input['write_abilities'] ) && is_array( $input['write_abilities'] ) ? $input['write_abilities'] : array();
		foreach ( array_keys( self::write_abilities() ) as $slug ) {
			$clean['write_abilities'][ $slug ] = ! empty( $posted[ $slug ] );
		}
		return $clean;
	}

	/**
	 * Render the page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings = get_option( self::OPTION, array() );
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<p><?php esc_html_e( 'Read-only abilities (list-posts, get-post, find-duplicates) are always available to users who can edit posts. Write abilities are off by default; enable only what you need.', 'synapsefabric-seo-abilities' ); ?></p>
			<form method="post" action="options.php">
				<?php settings_fields( self::PAGE ); ?>
				<fieldset>
					<?php foreach ( self::write_abilities() as $slug => $label ) : ?>
						<p>
							<label>
								<input type="checkbox"
									name="<?php echo esc_attr( self::OPTION . '[write_abilities][' . $slug . ']' ); ?>"
									value="1" <?php checked( ! empty( $settings['write_abilities'][ $slug ] ) ); ?> />
								<?php echo esc_html( $label ); ?>
							</label>
						</p>
					<?php endforeach; ?>
				</fieldset>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
