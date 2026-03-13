import Document, { DocumentContext, Html, Head, Main, NextScript } from 'next/document';

interface MyDocumentProps {
  nonce?: string;
}

export default class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    const nonce = ctx.res?.getHeader('x-nonce') as string | undefined;
    return { ...initialProps, nonce };
  }

  render() {
    const { nonce } = this.props;
    return (
      <Html lang="en">
        <Head nonce={nonce}>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        </Head>
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
