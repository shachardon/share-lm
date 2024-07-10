from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, Column, Integer, String, ARRAY, JSON, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from anonymization import Anonymization, AnonymizerChain, EmailAnonymizer, PhoneNumberAnonymizer, MacAddressAnonymizer, \
    Ipv4Anonymizer, Ipv6Anonymizer, CreditCardAnonymizer, IbanAnonymizer


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Define your SQLAlchemy database connection
DATABASE_URL = 'INSERT_YOUR_DATABASE_URL_HERE'
engine = create_engine(DATABASE_URL)

# Create a Session
Session = sessionmaker(bind=engine)
session = Session()

# Define your SQLAlchemy model
Base = declarative_base()


class Conversation(Base):
    __tablename__ = 'conversations'

    id = Column(Integer, primary_key=True)
    conversation_id = Column(String(255), nullable=False)
    bot_msgs = Column(ARRAY(String), nullable=False)
    user_msgs = Column(ARRAY(String), nullable=False)
    page_url = Column(String(255), nullable=False)
    user_id = Column(String(255), nullable=False)
    user_metadata = Column(JSON, nullable=True)
    timestamp = Column(String(255), nullable=False)
    conversation_metadata = Column(JSON, nullable=True)


# Create the table if it doesn't exist
if not inspect(engine).has_table('conversations'):
    Base.metadata.create_all(engine)

anon = AnonymizerChain(Anonymization('en_US'))
anon.add_anonymizers(EmailAnonymizer, PhoneNumberAnonymizer, MacAddressAnonymizer, \
    Ipv4Anonymizer, Ipv6Anonymizer, CreditCardAnonymizer, IbanAnonymizer)


@app.route('/api/endpoint', methods=['POST'])
def store_conversation():
    try:
        data = request.get_json()

        # Extract data from the request
        conversation_id = data['conversation_id']
        bot_msgs = data['bot_msgs']
        user_msgs = data['user_msgs']
        page_url = data['page_url']
        user_id = data['user_id']
        user_metadata = data['user_metadata']
        timestamp = data['timestamp']
        conversation_metadata = data['conversation_metadata']

        anon_bot_msgs = [anon.anonymize(msg) for msg in bot_msgs]
        anon_user_msgs = [anon.anonymize(msg) for msg in user_msgs]

        # Create a new Conversation record and add it to the database
        new_conversation = Conversation(
            conversation_id=conversation_id,
            bot_msgs=anon_bot_msgs,
            user_msgs=anon_user_msgs,
            page_url=page_url,
            user_id=user_id,
            user_metadata=user_metadata,
            timestamp=timestamp,
            conversation_metadata=conversation_metadata
        )
        session.add(new_conversation)
        session.commit()

        return jsonify({'message': 'Conversation saved successfully', "conversation_id": conversation_id}), 200
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)