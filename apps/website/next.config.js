//set up dotenv package
const webpack = require('webpack');
const { parsed: myEnv} = require('dotenv').config({
  path: "./.env" //path to .env file in NextJS root folder
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  //inject dotenv environment variables into NextJS process.env variable
  webpack: (config, {isServer}) => {
    /*
    if(!isServer) {
      config.resolve.fallback = {net: false, tls: false}
    }
    */
    config.plugins.push(new webpack.EnvironmentPlugin(myEnv));
    return config;
  },

  trailingSlash: true,

  env: {
    API_ROOT: 'http:/localhost:5126',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        port: '',
        pathname: "/**"
      },
      {
        protocol: 'https',
        hostname: 'static1.campusgroups.com',
        port: '',
        pathname: '/upload/pnw/**'
      },
      {
        protocol: 'https',
        hostname: 'mypnwlife.pnw.edu',
        port: '',
        pathname: '/images/ico/male_user_large.png'
      }
    ]
  }
}

module.exports = nextConfig