<?php
/**
 * Duplicate detection: word shingling + Jaccard similarity.
 *
 * Pure PHP (no WordPress calls) so it can be unit-tested without a site.
 *
 * @package SynapseFabric_SEO_Abilities
 */

defined( 'ABSPATH' ) || defined( 'SFSA_TESTING' ) || exit;

/**
 * Similarity engine.
 */
class SFSA_Similarity {

	const SHINGLE_SIZE   = 3;
	const CONTENT_WEIGHT = 0.7;
	const TITLE_WEIGHT   = 0.3;

	/**
	 * Small English stopword list (used for titles only).
	 *
	 * @var string[]
	 */
	private static $stopwords = array( 'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'what', 'with', 'your', 'you' );

	/**
	 * Strip markup, shortcodes and block comments; return lowercase words.
	 *
	 * @param string $text Raw post content or title.
	 * @return string[]
	 */
	public static function tokens( $text ) {
		$text = preg_replace( '/<!--.*?-->/s', ' ', (string) $text );
		$text = preg_replace( '/\[\/?[a-zA-Z0-9_-]+[^\]]*\]/', ' ', $text );
		$text = html_entity_decode( strip_tags( $text ), ENT_QUOTES, 'UTF-8' );
		$text = function_exists( 'mb_strtolower' ) ? mb_strtolower( $text, 'UTF-8' ) : strtolower( $text );
		preg_match_all( '/[\p{L}\p{N}]+(?:[\'’][\p{L}]+)?/u', $text, $m );
		return $m[0];
	}

	/**
	 * Hashed word shingles as a set (hash => true).
	 *
	 * @param string[] $tokens Words.
	 * @param int      $k      Shingle size.
	 * @return array<int,bool>
	 */
	public static function shingles( array $tokens, $k = self::SHINGLE_SIZE ) {
		$set = array();
		$n   = count( $tokens );
		if ( 0 === $n ) {
			return $set;
		}
		if ( $n < $k ) {
			$set[ crc32( implode( ' ', $tokens ) ) ] = true;
			return $set;
		}
		for ( $i = 0; $i <= $n - $k; $i++ ) {
			$set[ crc32( implode( ' ', array_slice( $tokens, $i, $k ) ) ) ] = true;
		}
		return $set;
	}

	/**
	 * Title words without stopwords, as a set (word => true).
	 *
	 * @param string $title Title.
	 * @return array<string,bool>
	 */
	public static function title_set( $title ) {
		$set = array();
		foreach ( self::tokens( $title ) as $word ) {
			if ( ! in_array( $word, self::$stopwords, true ) ) {
				$set[ $word ] = true;
			}
		}
		return $set;
	}

	/**
	 * Count shared members for every pair of sets that share at least one, via an inverted index.
	 *
	 * @param array<int,array> $sets     id => set.
	 * @param float            $max_freq Ignore members present in more than this share of sets (boilerplate), when there are 10+ sets.
	 * @return array<string,int> "a:b" (a<b) => shared count.
	 */
	private static function shared_counts( array $sets, $max_freq = 0.3 ) {
		$index = array();
		foreach ( $sets as $id => $set ) {
			foreach ( $set as $member => $_ ) {
				$index[ $member ][] = $id;
			}
		}
		$limit  = count( $sets ) >= 10 ? max( 2, (int) floor( count( $sets ) * $max_freq ) ) : PHP_INT_MAX;
		$shared = array();
		foreach ( $index as $ids ) {
			$c = count( $ids );
			if ( $c < 2 || $c > $limit ) {
				continue;
			}
			for ( $i = 0; $i < $c; $i++ ) {
				for ( $j = $i + 1; $j < $c; $j++ ) {
					$key            = $ids[ $i ] < $ids[ $j ] ? $ids[ $i ] . ':' . $ids[ $j ] : $ids[ $j ] . ':' . $ids[ $i ];
					$shared[ $key ] = ( $shared[ $key ] ?? 0 ) + 1;
				}
			}
		}
		return $shared;
	}

	/**
	 * Jaccard from set sizes and intersection size.
	 *
	 * @param int $a      Size of set A.
	 * @param int $b      Size of set B.
	 * @param int $shared Intersection size.
	 * @return float
	 */
	private static function jaccard( $a, $b, $shared ) {
		$union = $a + $b - $shared;
		return $union > 0 ? $shared / $union : 0.0;
	}

	/**
	 * Group near-duplicate documents.
	 *
	 * @param array<int,array{title:string,content:string}> $docs      id => doc.
	 * @param float                                          $threshold Minimum combined score (0-1) for a pair to be linked.
	 * @return array<int,array{ids:int[],max_score:float,pairs:array}> Groups, highest score first.
	 */
	public static function find_groups( array $docs, $threshold = 0.5 ) {
		$content = array();
		$titles  = array();
		foreach ( $docs as $id => $doc ) {
			$content[ $id ] = self::shingles( self::tokens( $doc['content'] ) );
			$titles[ $id ]  = self::title_set( $doc['title'] );
		}

		$content_shared = self::shared_counts( $content );
		$title_shared   = self::shared_counts( $titles, 1.0 );
		$candidates     = array_keys( $content_shared + $title_shared );

		$parent = array();
		$find   = function ( $x ) use ( &$parent, &$find ) {
			while ( $parent[ $x ] !== $x ) {
				$parent[ $x ] = $parent[ $parent[ $x ] ];
				$x            = $parent[ $x ];
			}
			return $x;
		};

		$pairs = array();
		foreach ( $candidates as $key ) {
			list( $a, $b ) = array_map( 'intval', explode( ':', $key ) );
			$cs = self::jaccard( count( $content[ $a ] ), count( $content[ $b ] ), $content_shared[ $key ] ?? 0 );
			$ts = self::jaccard( count( $titles[ $a ] ), count( $titles[ $b ] ), $title_shared[ $key ] ?? 0 );
			$score = self::CONTENT_WEIGHT * $cs + self::TITLE_WEIGHT * $ts;
			if ( $score < $threshold ) {
				continue;
			}
			$pairs[] = array(
				'a'                  => $a,
				'b'                  => $b,
				'score'              => round( $score, 3 ),
				'content_similarity' => round( $cs, 3 ),
				'title_similarity'   => round( $ts, 3 ),
			);
			foreach ( array( $a, $b ) as $x ) {
				if ( ! isset( $parent[ $x ] ) ) {
					$parent[ $x ] = $x;
				}
			}
			$parent[ $find( $a ) ] = $find( $b );
		}

		$groups = array();
		foreach ( array_keys( $parent ) as $id ) {
			$groups[ $find( $id ) ]['ids'][] = $id;
		}
		foreach ( $pairs as $pair ) {
			$root                      = $find( $pair['a'] );
			$groups[ $root ]['pairs'][] = $pair;
		}
		$out = array();
		foreach ( $groups as $g ) {
			sort( $g['ids'] );
			usort(
				$g['pairs'],
				function ( $x, $y ) {
					return $y['score'] <=> $x['score'];
				}
			);
			$g['max_score'] = $g['pairs'][0]['score'];
			$out[]          = $g;
		}
		usort(
			$out,
			function ( $x, $y ) {
				return $y['max_score'] <=> $x['max_score'];
			}
		);
		return $out;
	}
}
