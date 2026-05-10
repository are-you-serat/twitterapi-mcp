#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Interface definitions for TwitterAPI.io responses
 */
interface TwitterUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  verified?: boolean;
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
  profile_image_url?: string;
  created_at?: string;
}

interface Tweet {
  id: string;
  text: string;
  author: TwitterUser;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
  };
  in_reply_to?: string;
  referenced_tweets?: Array<{
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
  }>;
}

interface SearchResponse {
  data: Tweet[];
  meta?: {
    result_count: number;
    next_token?: string;
  };
}

interface UserResponse {
  data: TwitterUser;
}

interface TweetsResponse {
  data: Tweet[];
}

/**
 * TwitterAPI.io MCP Server
 * Provides access to Twitter data through TwitterAPI.io service
 */
class TwitterAPIMCPServer {
  private server: Server;
  private apiClient: AxiosInstance;
  private apiKey: string;
  private loginCookie: string | null = null;

  constructor() {
    // Get API key from environment
    this.apiKey = process.env.TWITTERAPI_API_KEY || '';
    if (!this.apiKey) {
      console.error('Warning: TWITTERAPI_API_KEY environment variable not set');
    }

    this.server = new Server(
      {
        name: 'twitterapi-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Configure axios client with proxy support
    const axiosConfig: AxiosRequestConfig = {
      baseURL: 'https://api.twitterapi.io/twitter',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TwitterAPI-MCP-Server/1.0.0'
      }
    };

    // Proxy support for enterprise environments
    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxyUrl) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false;
      console.log('Using proxy:', proxyUrl);
    }

    this.apiClient = axios.create(axiosConfig);

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_user_by_username',
            description: 'Get Twitter user information by username',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'get_user_by_id',
            description: 'Get Twitter user information by user ID',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'Twitter user ID',
                },
              },
              required: ['user_id'],
            },
          } as Tool,
          {
            name: 'get_user_tweets',
            description: 'Get tweets from a specific user',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                count: {
                  type: 'number',
                  description: 'Number of tweets to retrieve (default: 10, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'search_tweets',
            description: 'Search for tweets using keywords via advanced_search. Results are filtered internally: only tweets from authors who are Blue Verified AND have DMs enabled are returned. Authors not meeting these criteria or the minimum follower threshold are silently filtered out with a summary message.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for tweets',
                },
                count: {
                  type: 'number',
                  description: 'Number of tweets to retrieve (default: 10, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
                result_type: {
                  type: 'string',
                  description: 'Type of search results',
                  enum: ['recent', 'popular', 'mixed'],
                },
                min_followers: {
                  type: 'number',
                  description: 'Minimum number of followers an author must have for their tweet to be included (default: 0)',
                  minimum: 0,
                },
                max_followers: {
                  type: 'number',
                  description: 'Maximum number of followers an author must have for their tweet to be included (default: unlimited)',
                  minimum: 0,
                },
              },
              required: ['query'],
            },
          } as Tool,
          {
            name: 'get_tweet_by_id',
            description: 'Get a specific tweet by its ID',
            inputSchema: {
              type: 'object',
              properties: {
                tweet_id: {
                  type: 'string',
                  description: 'Twitter tweet ID',
                },
              },
              required: ['tweet_id'],
            },
          } as Tool,
          {
            name: 'get_tweet_replies',
            description: 'Get replies to a specific tweet',
            inputSchema: {
              type: 'object',
              properties: {
                tweet_id: {
                  type: 'string',
                  description: 'Twitter tweet ID',
                },
                count: {
                  type: 'number',
                  description: 'Number of replies to retrieve (default: 10, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['tweet_id'],
            },
          } as Tool,
          {
            name: 'get_user_followers',
            description: 'Get followers of a specific user',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                count: {
                  type: 'number',
                  description: 'Number of followers to retrieve (default: 20, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'get_user_following',
            description: 'Get users that a specific user is following',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                count: {
                  type: 'number',
                  description: 'Number of following to retrieve (default: 20, max: 100)',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'search_users',
            description: 'Search for Twitter users',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for users',
                },
                count: {
                  type: 'number',
                  description: 'Number of users to retrieve (default: 10, max: 50)',
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: ['query'],
            },
          } as Tool,
          {
            name: 'login_user',
            description: 'Login to Twitter account for write actions (requires username and password)',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username or email',
                },
                password: {
                  type: 'string',
                  description: 'Twitter password',
                },
              },
              required: ['username', 'password'],
            },
          } as Tool,
          {
            name: 'create_tweet',
            description: 'Create a new tweet (requires login)',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Tweet text (max 280 characters)',
                  maxLength: 280,
                },
                reply_to: {
                  type: 'string',
                  description: 'Tweet ID to reply to (optional)',
                },
              },
              required: ['text'],
            },
          } as Tool,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        
        if (!args) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
        }

        switch (name) {
          case 'get_user_by_username':
            return await this.getUserByUsername(args.username as string);

          case 'get_user_by_id':
            return await this.getUserById(args.user_id as string);

          case 'get_user_tweets':
            return await this.getUserTweets(
              args.username as string,
              args.count as number
            );

          case 'search_tweets':
            return await this.searchTweets(
              args.query as string,
              args.count as number,
              args.result_type as string,
              args.min_followers as number,
              args.max_followers as number | undefined
            );

          case 'get_tweet_by_id':
            return await this.getTweetById(args.tweet_id as string);

          case 'get_tweet_replies':
            return await this.getTweetReplies(
              args.tweet_id as string,
              args.count as number
            );

          case 'get_user_followers':
            return await this.getUserFollowers(
              args.username as string,
              args.count as number
            );

          case 'get_user_following':
            return await this.getUserFollowing(
              args.username as string,
              args.count as number
            );

          case 'search_users':
            return await this.searchUsers(
              args.query as string,
              args.count as number
            );

          case 'login_user':
            return await this.loginUser(
              args.username as string,
              args.password as string
            );

          case 'create_tweet':
            return await this.createTweet(
              args.text as string,
              args.reply_to as string
            );

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(ErrorCode.InternalError, `TwitterAPI.io error: ${message}`);
      }
    });
  }

  private async makeRequest(endpoint: string, params?: Record<string, any>): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {},
        params: params || {},
      };

      // Add API key if available
      if (this.apiKey && config.headers) {
        config.headers['x-api-key'] = this.apiKey;
      }

      // Add login cookie for write actions
      if (this.loginCookie && config.headers) {
        config.headers['Cookie'] = this.loginCookie;
      }

      const response = await this.apiClient.get(endpoint, config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message;
        throw new Error(`TwitterAPI.io API error (${statusCode}): ${errorMessage}`);
      }
      throw error;
    }
  }

  private async makePostRequest(endpoint: string, data: Record<string, any>): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {},
      };

      // Add API key if available
      if (this.apiKey && config.headers) {
        config.headers['x-api-key'] = this.apiKey;
      }

      // Add login cookie for write actions
      if (this.loginCookie && config.headers) {
        config.headers['Cookie'] = this.loginCookie;
      }

      const response = await this.apiClient.post(endpoint, data, config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message;
        throw new Error(`TwitterAPI.io API error (${statusCode}): ${errorMessage}`);
      }
      throw error;
    }
  }

  private async getUserByUsername(username: string): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/info`, { userName: username });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getUserById(userId: string): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/info`, { user_id: userId });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getUserTweets(username: string, count: number = 10): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/last_tweets`, {
      userName: username,
      count: Math.min(count, 100),
    });

    // Extract tweets array from response
    const rawData = data as Record<string, unknown>;
    const innerData = rawData?.data as Record<string, unknown> | undefined;
    const tweets: unknown[] = Array.isArray(data)
      ? data
      : innerData
        ? (innerData?.tweets as unknown[] ?? [])
        : (rawData?.tweets as unknown[] ?? []);

    // Activity filter: check if the most recent tweet is older than 60 days
    if (tweets.length > 0) {
      const firstTweet = tweets[0] as Record<string, unknown>;
      const createdAt = firstTweet?.createdAt as string | undefined;
      if (createdAt) {
        const tweetDate = new Date(createdAt);
        const now = new Date();
        const diffDays = (now.getTime() - tweetDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 60) {
          const daysAgo = Math.floor(diffDays);
          return {
            content: [
              {
                type: 'text',
                text: `[MCP internal filter] This blogger does not qualify: their last post was ${daysAgo} days ago (more than 60 days). Low activity account.`,
              },
            ],
          };
        }
      }
    }

    // Build compact response: blogger info + posts not older than 60 days as numbered list
    const now = new Date();
    const cutoff = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

    // Extract author info from first tweet
    let bloggerName = '';
    let bloggerBio = '';
    if (tweets.length > 0) {
      const author = (tweets[0] as Record<string, unknown>)?.author as Record<string, unknown> | undefined;
      bloggerName = (author?.name as string) ?? (author?.userName as string) ?? '';
      const profileBio = author?.profile_bio as Record<string, unknown> | undefined;
      bloggerBio = (profileBio?.description as string) ?? (author?.description as string) ?? '';
    }

    // Filter posts not older than 60 days and collect their texts
    const recentTexts: string[] = [];
    for (const tweet of tweets) {
      const t = tweet as Record<string, unknown>;
      const createdAt = t?.createdAt as string | undefined;
      if (createdAt) {
        const tweetDate = new Date(createdAt);
        if (now.getTime() - tweetDate.getTime() <= cutoff) {
          const text = t?.text as string | undefined;
          if (text) recentTexts.push(text);
        }
      }
    }

    const postsString = recentTexts.map((text, i) => `${i + 1}. ${text}`).join('\n');

    const output = [
      `Blogger: ${bloggerName}`,
      `Bio: ${bloggerBio}`,
      `Posts (last 60 days):\n${postsString || '(none)'}`,
    ].join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async searchTweets(
    query: string,
    count: number = 10,
    resultType: string = 'recent',
    minFollowers: number = 0,
    maxFollowers?: number
  ): Promise<CallToolResult> {
    const data = await this.makeRequest(`/tweet/advanced_search`, {
      query,
      count: Math.min(count, 100),
      result_type: resultType,
    });

    // Extract tweets array from response
    const tweets: any[] = Array.isArray(data) ? data : (data?.tweets || data?.data || []);
    const totalFetched = tweets.length;

    // Filter by isBlueVerified === true, canDm === true, min/max followers
    const filtered = tweets.filter((tweet: any) => {
      const author = tweet?.author ?? tweet;
      const isBlueVerified = author?.isBlueVerified === true;
      const canDm = author?.canDm === true;
      const followers = typeof author?.followers === 'number' ? author.followers : 0;
      const meetsMin = followers >= minFollowers;
      const meetsMax = maxFollowers === undefined || followers <= maxFollowers;
      return isBlueVerified && canDm && meetsMin && meetsMax;
    });

    const removedCount = totalFetched - filtered.length;

    // Map to compact format: only fields needed for blogger analysis
    const compact = filtered.map((tweet: any) => {
      const author = tweet?.author ?? tweet;
      const profileBio = author?.profile_bio as Record<string, unknown> | undefined;
      const bio = (profileBio?.description as string) ?? (author?.description as string) ?? '';
      return {
        userName: author?.userName ?? '',
        followers: author?.followers ?? 0,
        description: bio,
        location: author?.location ?? '',
        text: tweet?.text ?? '',
        createdAt: tweet?.createdAt ?? '',
      };
    });

    const followersCriteria = maxFollowers !== undefined
      ? `followers >= ${minFollowers} and <= ${maxFollowers}`
      : `followers >= ${minFollowers}`;
    const filterSummary =
      removedCount > 0
        ? `[MCP internal filter] ${removedCount} out of ${totalFetched} tweet(s) were removed because their authors did not meet the criteria: isBlueVerified=true, canDm=true, ${followersCriteria}.`
        : `[MCP internal filter] All ${totalFetched} tweet(s) passed the filter (isBlueVerified=true, canDm=true, ${followersCriteria}).`;

    return {
      content: [
        {
          type: 'text',
          text: filterSummary + '\n\n' + JSON.stringify(compact, null, 2),
        },
      ],
    };
  }

  private async getTweetById(tweetId: string): Promise<CallToolResult> {
    const data = await this.makeRequest(`/tweets`, { tweet_id: tweetId });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getTweetReplies(tweetId: string, count: number = 10): Promise<CallToolResult> {
    const data = await this.makeRequest(`/tweet/replies`, {
      id: tweetId,
      count: Math.min(count, 100),
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getUserFollowers(username: string, count: number = 20): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/followers`, {
      userName: username,
      count: Math.min(count, 100),
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async getUserFollowing(username: string, count: number = 20): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/followings`, {
      userName: username,
      count: Math.min(count, 100),
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async searchUsers(query: string, count: number = 10): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/search`, {
      query,
      count: Math.min(count, 50),
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async loginUser(username: string, password: string): Promise<CallToolResult> {
    try {
      const loginData = await this.makePostRequest('/user_login_v2', {
        userName: username,
        password,
      });

      // Store login cookie for future requests
      if (loginData.cookie) {
        this.loginCookie = loginData.cookie;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Login successful',
              user: loginData.user || {},
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Login failed',
            }, null, 2),
          },
        ],
      };
    }
  }

  private async createTweet(text: string, replyTo?: string): Promise<CallToolResult> {
    if (!this.loginCookie) {
      throw new Error('Must login first before creating tweets');
    }

    const tweetData: Record<string, any> = { text };
    if (replyTo) {
      tweetData.reply_to = replyTo;
    }

    const data = await this.makePostRequest('/create_tweet_v2', tweetData);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('TwitterAPI.io MCP server running on stdio');
  }
}

const server = new TwitterAPIMCPServer();
server.run().catch(console.error);