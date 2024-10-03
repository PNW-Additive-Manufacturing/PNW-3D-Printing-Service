import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			colors: {
				"pnw-gold": "var(--pnw-gold)",
				"pnw-gold-light": "var(--pnw-gold-light)",
				"indicator-inactive": "#94a3b8",
				"cool-black": "#303030",
				"pnw-mystic": "hsl(33, 100%, 52.9%)"
			},
			backgroundColor: {
				"pnw-mystic": "hsl(33, 100%, 52.9%)",
				background: "rgb(248, 248, 248)"
			},
			backgroundImage: {
				"gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
				"gradient-linear-pnw-mystic":
					"linear-gradient(45deg, hsl(33.1, 100%, 68%) 0%, hsl(58.1, 100%, 68.8%) 100%)",
				"gradient-conic":
					"conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))"
			},
			borderWidth: {
				"3": "3px"
			},
			width: {
				"1/8": "12.5%",
				"1/10": "10%",
				"9/10": "90%",
				"84": "21rem",
				"88": "22rem",
				"92": "23rem"
			},
			minWidth: {
				"84": "21rem",
				"88": "22rem"
			},
			height: {
				"5.5": "1.375rem",
				"88": "22rem",
				"84": "21rem",
				nav: "var(--nav-height)",
				"remaining-screen-with-nav": "calc(100vh - var(--nav-height))"
			}
		}
	},
	plugins: []
};
export default config;