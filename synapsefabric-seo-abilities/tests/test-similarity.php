<?php
// Standalone test: php tests/test-similarity.php
define( 'SFSA_TESTING', true );
require __DIR__ . '/../includes/class-sfsa-similarity.php';

$fail = 0;
function check( $label, $cond ) {
	global $fail;
	echo ( $cond ? 'ok   ' : 'FAIL ' ) . $label . "\n";
	$fail += $cond ? 0 : 1;
}

$base = 'WordPress caching speeds up your site by storing rendered pages so the server does not rebuild them on every request. Page caching, object caching and browser caching each help in a different way, and most hosts support at least one of them out of the box.';
$docs = array(
	1 => array( 'title' => 'How to speed up WordPress with caching', 'content' => '<!-- wp:paragraph --><p>' . $base . '</p><!-- /wp:paragraph -->' ),
	2 => array( 'title' => 'Speed up WordPress with caching', 'content' => '<p>' . $base . ' [shortcode] Extra closing sentence here.</p>' ),
	3 => array( 'title' => 'Baking sourdough bread at home', 'content' => '<p>Mix flour, water and starter, let the dough rest overnight, then bake in a hot dutch oven until the crust is deep golden brown.</p>' ),
	4 => array( 'title' => 'Choosing a sourdough starter', 'content' => '<p>A healthy starter doubles in size within hours of feeding and smells pleasantly tangy rather than sharp.</p>' ),
);
$groups = SFSA_Similarity::find_groups( $docs, 0.5 );
check( 'one group found', 1 === count( $groups ) );
check( 'group is posts 1 and 2', array( 1, 2 ) === $groups[0]['ids'] );
check( 'score high', $groups[0]['max_score'] > 0.7 );

check( 'unrelated posts not grouped', 0 === count( SFSA_Similarity::find_groups( array( 3 => $docs[3], 4 => $docs[4] ), 0.5 ) ) );
check( 'empty input ok', array() === SFSA_Similarity::find_groups( array() ) );
check( 'tokens strip markup', array( 'hello', 'world' ) === SFSA_Similarity::tokens( '<!-- wp:x --><b>Hello</b> [gallery ids="1"] world' ) );

exit( $fail ? 1 : 0 );
